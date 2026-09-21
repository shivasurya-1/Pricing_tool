from datetime import datetime, timezone

from accounts.models import Role
from accounts.permissions import role_write_permission
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .id_utils import next_quotation_number, next_rfq_number
from .models import AppNotification, AuditEvent, Customer, CostBreakdownLine, Product, Quotation, RFQ, RFQItem, Vendor
from .serializers import (
    AppNotificationSerializer,
    AuditEventSerializer,
    CustomerSerializer,
    ProductSerializer,
    QuotationSerializer,
    RFQSerializer,
    VendorSerializer,
)
from .workflow import (
    NEXT_STAGE,
    REJECTABLE_STAGES,
    SEND_BACK_TARGETS,
    STAGE_OWNER,
    WorkflowError,
    require_rejectable,
    require_role_can_act,
    require_stage,
    require_valid_send_back,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def append_audit(rfq, *, user, role, module, record, action_text, previous_status=None, new_status=None, comment=None):
    return AuditEvent.objects.create(
        rfq=rfq, timestamp=now_iso(), user=user, role=role, module=module, record=record, action=action_text,
        previous_status=previous_status, new_status=new_status, comment=comment,
    )


def append_notification(*, message, kind, target_role=None, rfq=None, quotation=None):
    return AppNotification.objects.create(message=message, timestamp=now_iso(), kind=kind, target_role=target_role, rfq=rfq, quotation=quotation)


def touch(rfq: RFQ) -> None:
    """Bumps updated_at and persists the RFQ. Callers mutate other fields (stage,
    status, value, ...) on the in-memory instance first, so this must be a full
    save — restricting to update_fields=["updated_at"] would silently drop those."""
    rfq.updated_at = now_iso()
    rfq.save()


def require_non_negative(value, field_name: str) -> float:
    """create()/save_cost_breakdown() build model instances directly from raw request
    data rather than through a ModelSerializer, so nothing was rejecting a negative
    quantity or price before this — a client could submit -5 units or a negative
    selling price and it would just save."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValidationError({field_name: "Must be a number."})
    if number < 0:
        raise ValidationError({field_name: "Cannot be negative."})
    return number


def require_positive(value, field_name: str) -> float:
    number = require_non_negative(value, field_name)
    if number <= 0:
        raise ValidationError({field_name: "Must be greater than zero."})
    return number


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("-updated_at")
    serializer_class = CustomerSerializer
    permission_classes = [role_write_permission(("Sales",))]


class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all().order_by("name")
    serializer_class = VendorSerializer
    permission_classes = [role_write_permission(("Sourcing", "Controlling"))]


class ProductViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only in the frontend too — no add/edit UI exists for the pulley catalog."""

    queryset = Product.objects.all().order_by("name")
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]


class AuditEventViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = AuditEventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AuditEvent.objects.select_related("rfq").all()
        rfq_id = self.request.query_params.get("rfqId")
        if rfq_id:
            qs = qs.filter(rfq_id=rfq_id)
        return qs


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = AppNotification.objects.select_related("rfq", "quotation").all()
    serializer_class = AppNotificationSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=["patch"])
    def read(self, request, pk=None):
        notif = self.get_object()
        notif.read = True
        notif.save(update_fields=["read"])
        return Response(self.get_serializer(notif).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        self.get_queryset().update(read=True)
        return Response({"status": "ok"})


class QuotationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Quotation.objects.select_related("rfq").all()
    serializer_class = QuotationSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        quotation = self.get_object()
        new_status = request.data.get("status")
        actor_name = request.data.get("actorName", "")
        loss_reason = request.data.get("lossReason")
        if not new_status:
            raise ValidationError({"status": "Required"})

        append_audit(
            quotation.rfq, user=actor_name, role="Sales", module="Quotation", record=quotation.quotation_number,
            action_text=f"Customer response updated: {new_status}",
            comment=f"Loss reason: {loss_reason}" if loss_reason else None,
        )
        quotation.status = new_status
        if loss_reason:
            quotation.loss_reason = loss_reason
        quotation.save()

        rfq = quotation.rfq
        if new_status == "Won":
            rfq.stage = "Won"
            rfq.status = "Won"
            touch(rfq)
        elif new_status == "Lost":
            rfq.stage = "Lost"
            rfq.status = "Lost"
            rfq.loss_reason = loss_reason
            touch(rfq)

        return Response(self.get_serializer(quotation).data)


class RFQViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = RFQ.objects.select_related("customer").prefetch_related("items", "items__cost_breakdown").all()
    serializer_class = RFQSerializer
    permission_classes = [IsAuthenticated]

    def _actor(self, request) -> tuple[str, str]:
        """(actorName, role) — actorName still comes from the request body (the
        frontend already knows the logged-in demo persona's display name); role comes
        from the authenticated demo-role user, so it can't be spoofed independently."""
        return request.data.get("actorName", ""), request.user.role

    def _handle_workflow_error(self, exc: WorkflowError):
        raise ValidationError({"detail": str(exc)})

    # ---- create -----------------------------------------------------------------
    def create(self, request):
        data = request.data
        customer = get_object_or_404(Customer, pk=data.get("customerId"))
        submit = bool(data.get("submit"))
        actor_name = data.get("actorName", "")
        stage = "Operations Review" if submit else "Draft"

        items_data = data.get("items", [])
        for i, it in enumerate(items_data):
            require_positive(it.get("quantity", 1), f"items[{i}].quantity")
            require_non_negative(it.get("targetPrice", 0), f"items[{i}].targetPrice")

        existing_numbers = list(RFQ.objects.values_list("rfq_number", flat=True))
        rfq_number = next_rfq_number(existing_numbers)
        now = now_iso()

        with transaction.atomic():
            rfq = RFQ.objects.create(
                id=rfq_number.lower(), rfq_number=rfq_number, customer=customer, customer_code=customer.code,
                contact_person=data.get("contactPerson", ""), contact_email=data.get("contactEmail", ""),
                contact_phone=data.get("contactPhone", ""), customer_reference=data.get("customerReference", ""),
                rfq_received_date=data.get("rfqReceivedDate", ""), project_name=data.get("projectName", ""),
                project_code=data.get("projectCode", ""), quote_reference=data.get("quoteReference", ""),
                end_customer=data.get("endCustomer") or customer.name, location=data.get("location", ""),
                industry=data.get("industry", ""), required_delivery_date=data.get("requiredDeliveryDate", ""),
                priority=data.get("priority", "Medium"), currency=data.get("currency", "INR"),
                payment_terms=data.get("paymentTerms", ""), delivery_terms=data.get("deliveryTerms", ""),
                quotation_validity=data.get("quotationValidity", ""), incoterms=data.get("incoterms", ""),
                tax_applicability=data.get("taxApplicability", ""), freight_requirement=data.get("freightRequirement", ""),
                customer_remarks=data.get("customerRemarks", ""), attachments=[], internal_notes=data.get("internalNotes", ""),
                customer_notes=data.get("customerNotes", ""), stage=stage, status=stage, sales_person=actor_name,
                created_at=now, updated_at=now,
                value=sum(float(it.get("targetPrice", 0) or 0) * float(it.get("quantity", 0) or 0) for it in items_data),
                target_margin_percent=15,
            )

            for i, it in enumerate(items_data):
                product = get_object_or_404(Product, pk=it.get("productId"))
                RFQItem.objects.create(
                    rfq=rfq, item_no=i + 1, product=product, product_code=it.get("productCode", product.code),
                    product_name=it.get("productName", product.name), description=it.get("description", ""),
                    quantity=it.get("quantity", 1), unit=it.get("unit", ""), specification=it.get("specification", ""),
                    required_delivery=it.get("requiredDelivery", ""), target_price=it.get("targetPrice", 0),
                    remarks=it.get("remarks", ""), technical_data=it.get("technicalData") or {},
                )

        append_audit(rfq, user=actor_name, role="Sales", module="RFQ", record=rfq.rfq_number, action_text="Created RFQ", new_status="Draft")
        if submit:
            append_audit(
                rfq, user=actor_name, role="Sales", module="RFQ", record=rfq.rfq_number,
                action_text="Submitted RFQ for Operations review", previous_status="Draft", new_status="Operations Review",
            )
            append_notification(message=f"{rfq.rfq_number} has been submitted for Operations review.", kind="info", target_role="Operations", rfq=rfq)

        return Response(self.get_serializer(rfq).data, status=status.HTTP_201_CREATED)

    # ---- stage transitions --------------------------------------------------------
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        rfq = self.get_object()
        actor_name, role = self._actor(request)
        try:
            require_stage(rfq, "Draft")
            require_role_can_act(role, "Draft")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        append_audit(rfq, user=actor_name, role="Sales", module="RFQ", record=rfq.rfq_number,
                     action_text="Submitted RFQ for Operations review", previous_status=rfq.stage, new_status="Operations Review")
        append_notification(message=f"{rfq.rfq_number} has been submitted for Operations review.", kind="info", target_role="Operations", rfq=rfq)
        rfq.stage = "Operations Review"
        rfq.status = "Operations Review"
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    @action(detail=True, methods=["patch"], url_path="operations-review")
    def save_operations_review(self, request, pk=None):
        rfq = self.get_object()
        _actor_name, role = self._actor(request)
        try:
            require_stage(rfq, "Operations Review")
            require_role_can_act(role, "Operations Review")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        rfq.operations_review = request.data.get("review")
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    @action(detail=True, methods=["post"], url_path="approve-operations")
    def approve_operations(self, request, pk=None):
        rfq = self.get_object()
        actor_name, role = self._actor(request)
        try:
            require_stage(rfq, "Operations Review")
            require_role_can_act(role, "Operations Review")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        append_audit(rfq, user=actor_name, role="Operations", module="RFQ", record=rfq.rfq_number,
                     action_text="Approved — technically feasible, forwarded to Sourcing", previous_status=rfq.stage, new_status="Sourcing")
        append_notification(message=f"{rfq.rfq_number} is awaiting vendor sourcing.", kind="success", target_role="Sourcing", rfq=rfq)
        rfq.stage = "Sourcing"
        rfq.status = "Sourcing"
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    # ---- item-level actions --------------------------------------------------------
    @action(detail=True, methods=["patch"], url_path="item-tech-data")
    def update_item_tech_data(self, request, pk=None):
        """Body: {itemId, technicalData} — the frontend computes the merged/derived
        values (applyFieldChange) client-side and sends the full resulting object;
        the backend just persists it, so the pulley geometry/formula logic isn't
        duplicated here."""
        rfq = self.get_object()
        _actor_name, role = self._actor(request)
        try:
            require_role_can_act(role, rfq.stage)
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        item = get_object_or_404(RFQItem, pk=request.data.get("itemId"), rfq=rfq)
        item.technical_data = request.data.get("technicalData") or {}
        item.save(update_fields=["technical_data"])
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    @action(detail=True, methods=["patch"], url_path="item-sourcing-confirmed")
    def confirm_item_sourcing(self, request, pk=None):
        rfq = self.get_object()
        _actor_name, role = self._actor(request)
        try:
            require_stage(rfq, "Sourcing")
            require_role_can_act(role, "Sourcing")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        item = get_object_or_404(RFQItem, pk=request.data.get("itemId"), rfq=rfq)
        item.sourcing_confirmed = bool(request.data.get("confirmed"))
        item.save(update_fields=["sourcing_confirmed"])
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    @action(detail=True, methods=["patch"], url_path="item-process-vendor")
    def assign_process_vendor(self, request, pk=None):
        rfq = self.get_object()
        _actor_name, role = self._actor(request)
        try:
            require_stage(rfq, "Sourcing")
            require_role_can_act(role, "Sourcing")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        item = get_object_or_404(RFQItem, pk=request.data.get("itemId"), rfq=rfq)
        process_key = request.data.get("processKey")
        others = [p for p in (item.process_vendors or []) if p.get("processKey") != process_key]
        others.append({"processKey": process_key, "vendorId": request.data.get("vendorId"), "vendorName": request.data.get("vendorName")})
        item.process_vendors = others
        item.save(update_fields=["process_vendors"])
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    # ---- sourcing --------------------------------------------------------------
    @action(detail=True, methods=["patch"], url_path="sourcing-comment")
    def save_sourcing_comment(self, request, pk=None):
        rfq = self.get_object()
        _actor_name, role = self._actor(request)
        try:
            require_stage(rfq, "Sourcing")
            require_role_can_act(role, "Sourcing")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        rfq.sourcing_comments = request.data.get("comment", "")
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    @action(detail=True, methods=["post"], url_path="submit-sourcing")
    def submit_sourcing(self, request, pk=None):
        rfq = self.get_object()
        actor_name, role = self._actor(request)
        try:
            require_stage(rfq, "Sourcing")
            require_role_can_act(role, "Sourcing")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        if not all(item.sourcing_confirmed for item in rfq.items.all()):
            raise ValidationError({"detail": "Every item must be confirmed before submitting."})
        append_audit(rfq, user=actor_name, role="Sourcing", module="RFQ", record=rfq.rfq_number,
                     action_text="Best vendor selected, submitted to Controlling", previous_status=rfq.stage, new_status="Controlling")
        append_notification(message=f"{rfq.rfq_number} is awaiting commercial pricing.", kind="info", target_role="Controlling", rfq=rfq)
        rfq.stage = "Controlling"
        rfq.status = "Controlling"
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    # ---- controlling --------------------------------------------------------------
    @action(detail=True, methods=["post"], url_path="cost-breakdown")
    def save_cost_breakdown(self, request, pk=None):
        rfq = self.get_object()
        _actor_name, role = self._actor(request)
        try:
            require_stage(rfq, "Controlling")
            require_role_can_act(role, "Controlling")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        lines = request.data.get("lines", [])
        for i, line in enumerate(lines):
            for field in ("baseCost", "freight", "duties", "otherCharges", "discount", "sellingPrice", "finalPrice"):
                require_non_negative(line.get(field, 0), f"lines[{i}].{field}")

        total_value = 0.0
        with transaction.atomic():
            for line in lines:
                item = get_object_or_404(RFQItem, pk=line.get("itemId"), rfq=rfq)
                CostBreakdownLine.objects.update_or_create(
                    item=item,
                    defaults={
                        "base_cost": line.get("baseCost", 0), "freight": line.get("freight", 0), "duties": line.get("duties", 0),
                        "other_charges": line.get("otherCharges", 0), "discount": line.get("discount", 0),
                        "adjusted_cost": line.get("adjustedCost", 0), "margin_percent": line.get("marginPercent", 0),
                        "margin_value": line.get("marginValue", 0), "selling_price": line.get("sellingPrice", 0),
                        "tax_percent": line.get("taxPercent", 0), "tax_value": line.get("taxValue", 0),
                        "final_price": line.get("finalPrice", 0),
                    },
                )
                total_value += float(line.get("finalPrice", 0) or 0)
            rfq.value = total_value
            touch(rfq)
        return Response(self.get_serializer(rfq).data)

    @action(detail=True, methods=["post"], url_path="submit-controlling")
    def submit_controlling(self, request, pk=None):
        rfq = self.get_object()
        actor_name, role = self._actor(request)
        try:
            require_stage(rfq, "Controlling")
            require_role_can_act(role, "Controlling")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        append_audit(rfq, user=actor_name, role="Controlling", module="RFQ", record=rfq.rfq_number,
                     action_text="Commercial pricing calculated, submitted for approval", previous_status=rfq.stage, new_status="Approval Pending")
        append_notification(message=f"Quotation for {rfq.rfq_number} is awaiting final approval.", kind="info", target_role="Approval Panel", rfq=rfq)
        rfq.stage = "Approval Pending"
        rfq.status = "Approval Pending"
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    # ---- approval --------------------------------------------------------------
    @action(detail=True, methods=["post"], url_path="approve-final")
    def approve_final(self, request, pk=None):
        rfq = self.get_object()
        actor_name, role = self._actor(request)
        comment = request.data.get("comment")
        try:
            require_stage(rfq, "Approval Pending")
            require_role_can_act(role, "Approval Pending")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        append_audit(rfq, user=actor_name, role="Approval Panel", module="RFQ", record=rfq.rfq_number,
                     action_text="Final quotation approved", previous_status=rfq.stage, new_status="Approved", comment=comment)
        append_notification(message=f"{rfq.rfq_number} was approved.", kind="success", target_role="Sales", rfq=rfq)
        rfq.stage = "Approved"
        rfq.status = "Approved"
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    # ---- send back / reject --------------------------------------------------------
    @action(detail=True, methods=["post"], url_path="send-back")
    def send_back(self, request, pk=None):
        rfq = self.get_object()
        actor_name, role = self._actor(request)
        target_stage = request.data.get("targetStage")
        comment = request.data.get("comment", "")
        try:
            require_valid_send_back(rfq.stage, target_stage)
            require_role_can_act(role, rfq.stage)
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        # `role` is the real authenticated role — never trust a client-supplied
        # "actorRole" for the audit trail, or a client could write any role it likes
        # into the one record this system exists to make trustworthy.
        append_audit(rfq, user=actor_name, role=role, module="RFQ", record=rfq.rfq_number,
                     action_text=f"Sent back to {STAGE_OWNER.get(target_stage, target_stage)}",
                     previous_status=rfq.stage, new_status=target_stage, comment=comment)
        append_notification(message=f"{rfq.rfq_number} was returned with comments.", kind="warning", target_role=STAGE_OWNER.get(target_stage), rfq=rfq)
        rfq.stage = target_stage
        rfq.status = target_stage
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        rfq = self.get_object()
        actor_name, role = self._actor(request)
        reason = request.data.get("reason", "")
        comment = request.data.get("comment", "")
        try:
            require_rejectable(rfq.stage)
            require_role_can_act(role, rfq.stage)
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        append_audit(rfq, user=actor_name, role=role, module="RFQ", record=rfq.rfq_number,
                     action_text=f"Rejected RFQ — {reason}", previous_status=rfq.stage, new_status="Rejected", comment=comment)
        append_notification(message=f"{rfq.rfq_number} was rejected.", kind="error", target_role="Sales", rfq=rfq)
        rfq.stage = "Rejected"
        rfq.status = "Rejected"
        touch(rfq)
        return Response(self.get_serializer(rfq).data)

    # ---- quotation --------------------------------------------------------------
    @action(detail=True, methods=["post"], url_path="generate-quotation")
    def generate_quotation(self, request, pk=None):
        rfq = self.get_object()
        actor_name, _role = self._actor(request)
        lines = list(CostBreakdownLine.objects.filter(item__rfq=rfq))
        margin_percent = sum(l.margin_percent for l in lines) / len(lines) if lines else rfq.target_margin_percent

        existing_numbers = list(Quotation.objects.values_list("quotation_number", flat=True))
        quotation_number = next_quotation_number(existing_numbers)
        now = now_iso()
        from datetime import timedelta
        valid_until = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat().replace("+00:00", "Z")

        quotation = Quotation.objects.create(
            id=quotation_number.lower().replace(" ", ""), quotation_number=quotation_number, rfq=rfq,
            customer_name=rfq.end_customer, project_name=rfq.project_name, quote_date=now, valid_until=valid_until,
            currency=rfq.currency, amount=rfq.value, margin_percent=margin_percent, status="Draft", sales_person=actor_name,
        )
        append_audit(rfq, user=actor_name, role="Sales", module="Quotation", record=quotation_number,
                     action_text="Quotation generated", previous_status=rfq.stage, new_status="Quotation Generated")
        append_notification(message=f"Quotation generated for {rfq.rfq_number}.", kind="success", rfq=rfq, quotation=quotation)
        rfq.stage = "Quotation Generated"
        rfq.status = "Quotation Generated"
        touch(rfq)
        return Response(QuotationSerializer(quotation).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="send-quotation")
    def send_quotation(self, request, pk=None):
        rfq = self.get_object()
        actor_name, _role = self._actor(request)
        append_audit(rfq, user=actor_name, role="Sales", module="Quotation", record=rfq.rfq_number,
                     action_text="Quotation sent to customer", previous_status=rfq.stage, new_status="Quotation Sent")
        append_notification(message=f"Quotation for {rfq.rfq_number} was sent to the customer.", kind="success", rfq=rfq)
        rfq.stage = "Quotation Sent"
        rfq.status = "Quotation Sent"
        touch(rfq)
        Quotation.objects.filter(rfq=rfq).update(status="Sent")
        return Response(self.get_serializer(rfq).data)
