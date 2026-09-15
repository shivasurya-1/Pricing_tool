# Questions for the Client — Pricing & Delivery Logic

Regarding: *Sample_Drum_Drive_Pulley_Pricing Tool.xlsx*

While building the pricing tool from your Excel file, we came across a few things that need your confirmation before we finalize the calculations. Please review the questions below.

---

## 1. Which raw material rate is correct?

Your Excel file has two different rate lists for the same materials, and they don't match:

| Material | Rate in "Cost Rate Tables" | Rate in "Raw Forging Prices" |
|---|---|---|
| Shell plate | ₹81.89/kg | ₹110/kg |
| Hub/end plate | ₹134.25/kg | ₹210/kg |
| Shaft – C45 | ₹91/kg | ₹310/kg |
| Shaft – 42CrMo4+QT | ₹233.96/kg | ₹330/kg |

**Our questions:**
- Which of these rates should we use — is one of them outdated?
- Can we remove the one that's not in use, to avoid confusion later?

---

## 2. Should material rate change based on pulley size?

Right now, every pulley — big or small — uses the same raw material rate (₹110/kg for shell, ₹210/kg for hub). We noticed your file also lists different rates for different size ranges in one place (e.g. ₹110/kg for medium pulleys, ₹130/kg for larger ones), but the calculation doesn't actually use those different rates.

**Our questions:**
- Should bigger pulleys cost more per kg than smaller ones, or is one flat rate correct?
- If rates should vary by size, can you tell us the correct rate for each size range? A few of those cells in your file are blank or marked "as per RFQ."

---

## 3. What should outsourcing cost for these 3 processes?

When a process is set to "Outsource," the tool calculates a cost automatically for most processes — but not for these three:

- **Welding**
- **Machining / Turning the body**
- **Shaft Machining**

**Our questions:**
- What should we charge for these when they're outsourced? Is there a standard rate (per hour, per kg, or a flat amount)?
- For Shaft Machining specifically, should the person creating the quote just type in a price manually each time, since it always goes to a specific vendor anyway?

---

## 4. Can these 2 processes ever be done in-house?

These two processes only have a cost when outsourced — there's no cost shown if you choose to do them in-house:

- **Stress Relief Annealing**
- **Static Balancing**

**Our questions:**
- Can these actually be done in-house? If yes, what would that cost and how long would it take?
- If they can never be done in-house, we'll simply remove that option from the choices.

---

## 5. Does delivery time change with pulley size?

Right now, delivery time for each step (e.g. "Shell Plate Procurement = 35 days") is the same no matter how big or small the pulley is.

**Our questions:**
- Does a bigger/heavier pulley actually take longer for any of these steps in real life?
- If yes, which steps matter most, and roughly how many extra days for a bigger size?
- If a single order has more than one pulley type, should we give the customer one delivery date for the whole order, or can each pulley type ship separately as it's ready?

---

## 6. A few smaller questions

- Your file doesn't have any vendor names or vendor pricing — is "In-house vs Outsource" just meant to be a cost/time decision, with the actual choosing of a vendor handled separately outside this tool?
- Is there one profit margin target for every quote, or does it change by customer, product type, or order size?
- Does a bigger discount need approval from someone more senior, or does the same person approve every quote?
- Do you ever quote directly in Euros or Dollars, or is everything calculated in Rupees first?

---

Once you confirm these, we'll update the tool to match and let you know if any numbers change from what you're currently seeing.
