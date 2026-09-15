import type { Role } from '@/types'
import {
  LayoutDashboard,
  FileText,
  Receipt,
  ListChecks,
  ClipboardCheck,
  Bell,
  Truck,
  Calculator,
  Building2,
  Factory,
  Package,
  Tags,
  BarChart3,
  LineChart,
  History,
  Users,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  roles?: Role[]
  dataTour?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, dataTour: 'nav-dashboard' },
      { label: 'RFQs', to: '/rfqs', icon: FileText, dataTour: 'nav-rfqs' },
      { label: 'Quotations', to: '/quotations', icon: Receipt, dataTour: 'nav-quotations' },
    ],
  },
  {
    title: 'Workbench',
    items: [
      { label: 'My Tasks', to: '/tasks', icon: ListChecks, dataTour: 'nav-tasks' },
      { label: 'Approvals', to: '/rfqs?stage=Approval+Pending', icon: ClipboardCheck, roles: ['Approval Panel', 'Admin'] },
      { label: 'Notifications', to: '/notifications', icon: Bell },
    ],
  },
  {
    title: 'Commercial',
    items: [
      { label: 'Sourcing', to: '/rfqs?stage=Sourcing', icon: Truck, roles: ['Sourcing', 'Admin'] },
      { label: 'Pricing / Costing', to: '/rfqs?stage=Controlling', icon: Calculator, roles: ['Controlling', 'Admin'] },
    ],
  },
  {
    title: 'Costing Tool',
    items: [
      { label: 'Pricing Tool', to: '/pricing-tool', icon: Calculator, roles: ['Sales', 'Controlling', 'Approval Panel', 'Admin'] },
      { label: 'Cost Rate Tables', to: '/cost-rate-tables', icon: Tags, roles: ['Controlling', 'Admin'] },
      { label: 'Raw Forging Prices', to: '/raw-forging-prices', icon: Factory, roles: ['Sourcing', 'Controlling', 'Admin'] },
      { label: 'Bearing & Sleeve Data', to: '/bearing-sleeve-data', icon: Package, roles: ['Sales', 'Sourcing', 'Admin'] },
      { label: 'Delivery Schedule', to: '/delivery-schedule', icon: Truck, roles: ['Sales', 'Sourcing', 'Admin'] },
      { label: 'In-House Hours', to: '/in-house-hours', icon: Calculator, roles: ['Controlling', 'Admin'] },
      { label: 'Formulas', to: '/formulas', icon: Calculator, roles: ['Controlling', 'Admin'] },
    ],
  },
  {
    title: 'Master Data',
    items: [
      { label: 'Customers', to: '/customers', icon: Building2, roles: ['Sales', 'Admin'] },
      { label: 'Vendors', to: '/vendors', icon: Factory, roles: ['Sourcing', 'Controlling', 'Admin'] },
      { label: 'Products / Materials', to: '/products', icon: Package, roles: ['Sales', 'Sourcing', 'Controlling', 'Admin'] },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { label: 'Reports', to: '/reports', icon: BarChart3 },
      { label: 'Analytics', to: '/analytics', icon: LineChart },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Users & Roles', to: '/users', icon: Users, roles: ['Admin'] },
      { label: 'Settings', to: '/settings', icon: Settings, roles: ['Admin'] },
      { label: 'Audit Log', to: '/audit-log', icon: History, roles: ['Admin'] },
    ],
  },
]

export function isNavItemVisible(item: NavItem, role: Role): boolean {
  if (!item.roles) return true
  return item.roles.includes(role)
}
