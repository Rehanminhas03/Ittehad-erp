import { subscribe } from '../../events/bus';
import { buildVehicleSchedule } from './service';

/** Service reacts to Sales: a delivered vehicle gets its service schedule (same transaction). */
subscribe('vehicle.activated', async (ctx, event) => {
  await buildVehicleSchedule(ctx, {
    vehicleId: event.payload.vehicleId,
    modelId: event.payload.modelId,
    activatedOn: event.payload.activatedOn,
  });
});
