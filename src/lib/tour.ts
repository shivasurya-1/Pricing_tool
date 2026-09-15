import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import type { Role } from '@/types'
import { navigateTo } from '@/lib/navigation'

const NEXT_ROLE: Record<Role, string> = {
  Sales: 'Operations reviews it next for technical feasibility.',
  Operations: 'Once approved, it moves to Sourcing for vendor selection.',
  Sourcing: 'Once a vendor is selected, it moves to Controlling for commercial pricing.',
  Controlling: 'Once priced, it goes to the Approval Panel for final sign-off.',
  'Approval Panel': 'Once approved, it returns to Sales to generate and send the quotation.',
  Admin: 'Admin can see every stage of this pipeline across all teams.',
}

const ROLE_INTRO: Record<Role, string> = {
  Sales: 'You create RFQs from customer requests, track them through the pipeline, and send the final quotation.',
  Operations: 'You check technical feasibility and delivery for every incoming RFQ before it moves to Sourcing.',
  Sourcing: 'You compare vendor pricing, availability and lead time to pick the best source for each item.',
  Controlling: 'You apply freight, duties, discounts and margin to calculate the final selling price.',
  'Approval Panel': 'You give the final sign-off on cost, margin and terms before a quotation can be sent.',
  Admin: 'You have visibility into every screen: masters, users, reports and the full audit trail.',
}

function commonSteps(role: Role): DriveStep[] {
  return [
    {
      popover: {
        title: `Welcome, ${role}`,
        description: ROLE_INTRO[role],
      },
    },
    {
      element: '[data-tour="nav-dashboard"]',
      popover: { title: 'Your dashboard', description: 'The sidebar and dashboard reshape themselves based on your role.', side: 'right' },
    },
  ]
}

function dashboardSteps(): DriveStep[] {
  const steps: DriveStep[] = [
    {
      element: '[data-tour="kpi-row"]',
      popover: { title: 'Key numbers at a glance', description: 'Live counts for what matters most to your role today.', side: 'bottom' },
    },
    {
      element: '[data-tour="primary-table"]',
      popover: { title: 'Your queue', description: 'Everything currently waiting on you, oldest and highest priority first.', side: 'top' },
    },
  ]
  const primaryActionExists = document.querySelector('[data-tour="primary-action"]')
  if (primaryActionExists) {
    steps.push({
      element: '[data-tour="primary-action"]',
      popover: { title: 'Take action', description: 'This is the main action for your role — click a row or this button to act.', side: 'top' },
    })
  }
  return steps
}

function trailingSteps(role: Role): DriveStep[] {
  return [
    {
      element: '[data-tour="global-search"]',
      popover: { title: 'Global search', description: 'Jump straight to any RFQ, customer, product or quotation.', side: 'bottom' },
    },
    {
      element: '[data-tour="nav-tasks"]',
      popover: { title: 'My Tasks', description: 'A focused, filterable list of every RFQ waiting on your action.', side: 'right' },
    },
    {
      popover: {
        title: "What's next",
        description: NEXT_ROLE[role],
      },
    },
  ]
}

export function startTour(role: Role) {
  navigateTo('/dashboard')
  window.setTimeout(() => {
    const steps = [...commonSteps(role), ...dashboardSteps(), ...trailingSteps(role)]
    const tour = driver({
      showProgress: true,
      popoverClass: 'rfq-tour-popover',
      steps,
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Done',
    })
    tour.drive()
  }, 200)
}
