import { definePermissions } from '../../auth/permissions';

export const ServicePerm = definePermissions('service', {
  setupView: ['service.setup.view', 'View service schedules and the inspection checklist'],
  setupManage: ['service.setup.manage', 'Maintain service schedules and the inspection checklist (global grant required)'],

  visitsView: ['service.visits.view', 'View all service visits in scope'],
  visitsViewOwn: ['service.visits.view_own', 'View own service visits'],
  visitsCreate: ['service.visits.create', 'Check vehicles in (create service visits)'],
  visitsUpdate: ['service.visits.update', 'Edit service visits and hand vehicles back'],

  jobCardsView: ['service.job_cards.view', 'View job cards'],
  jobCardsCreate: ['service.job_cards.create', 'Open job cards'],
  jobCardsUpdate: ['service.job_cards.update', 'Edit job cards, assign technicians, add work'],
  jobCardsWork: ['service.job_cards.work', 'Start work, mark lines done, complete job cards'],

  inspectionsView: ['service.inspections.view', 'View inspections'],
  inspectionsCreate: ['service.inspections.create', 'Start inspections'],
  inspectionsUpdate: ['service.inspections.update', 'Record inspection results'],

  estimatesView: ['service.estimates.view', 'View all estimates in scope'],
  estimatesViewOwn: ['service.estimates.view_own', 'View own estimates'],
  estimatesCreate: ['service.estimates.create', 'Create estimates'],
  estimatesUpdate: ['service.estimates.update', 'Edit draft estimates'],
  estimatesSubmit: ['service.estimates.submit', 'Submit estimates for approval'],
  estimatesApprove: ['service.estimates.approve', 'Approve or reject estimates'],
});
