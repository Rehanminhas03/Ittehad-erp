import { Section } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { P } from '../../../permissions';
import { type Delivery, useCompleteDeliveryMutation } from '../../../salesApi';
import { HandOverForm } from '../HandOverForm';

/**
 * Hands the vehicle over. Completing records the customer as owner, activates the vehicle
 * (warranty and service schedule start) and closes the order, all at once. The customer's
 * acknowledgement of receipt is required.
 */
export function DeliveryCompletion({ delivery }: { delivery: Delivery }) {
  const perm = usePermission();
  const toast = useToast();
  const [complete, { isLoading }] = useCompleteDeliveryMutation();

  if (delivery.status !== 'scheduled' || !perm.canIn(P.deliveriesComplete, delivery.dealershipId, delivery.branchId)) return null;
  return (
    <Section title="Hand over">
      <HandOverForm
        customerName={delivery.customerName}
        submitLabel="Complete delivery"
        loading={isLoading}
        onSubmit={async (request) => {
          try {
            await complete({ id: delivery.id, completeDeliveryRequest: request }).unwrap();
            toast.success('Vehicle delivered and activated');
          } catch (e) {
            toast.error(e);
          }
        }}
      />
    </Section>
  );
}
