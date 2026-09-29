import { Link, useParams } from 'react-router';
import { canEditRow, type EntityViewConfig } from '@/shared/entity';
import { usePermission, useToast } from '@/shared/hooks';
import { apiErrorMessage } from '@/shared/lib';
import { ApprovalWorkflow } from '../ApprovalWorkflow';
import { AuditTrailPanel } from '../AuditTrailPanel';
import { Button, DescriptionList, ErrorState, PageHeader, PageSpinner, Section } from '@/shared/components/ui';

/** Config-driven detail screen: fields, custom sections, approval workflow and audit trail. */
export function EntityDetailView<T extends { id: number }>({ config }: { config: EntityViewConfig<T> }) {
  const id = Number(useParams().id);
  const perm = usePermission();
  const { data: row, isLoading, isError, error, refetch } = config.api.useGet({ id });

  if (isLoading) return <PageSpinner />;
  if (isError || !row) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;

  const editable = !!config.form && canEditRow(config, perm, row);
  return (
    <div>
      <PageHeader
        title={config.detail.title(row)}
        subtitle={config.detail.subtitle?.(row)}
        breadcrumbs={[{ label: config.plural, to: config.basePath }, { label: config.detail.title(row) }]}
        actions={
          editable && (
            <Link to={`${config.basePath}/${row.id}/edit`}>
              <Button variant="secondary">Edit</Button>
            </Link>
          )
        }
      />
      {config.workflow && (
        <Section title="Approval">
          <WorkflowSection config={config} row={row} />
        </Section>
      )}
      <Section title="Details">
        <DescriptionList items={config.detail.fields.map((f) => ({ label: f.label, value: f.value(row) }))} />
      </Section>
      {config.detail.sections?.(row)}
      {config.api.useHistory && (
        <Section title="History">
          <AuditTrailPanel useHistory={config.api.useHistory} id={row.id} />
        </Section>
      )}
    </div>
  );
}

function WorkflowSection<T extends { id: number }>({ config, row }: { config: EntityViewConfig<T>; row: T }) {
  const wf = config.workflow!;
  const toast = useToast();
  const perm = usePermission();
  const { data: definition } = wf.useDefinition(undefined);
  const { data: history } = config.api.useHistory?.({ id: row.id }) ?? {};
  const [transition, { isLoading }] = wf.transition.useMutation();
  if (!definition) return null;
  const record = row as unknown as Record<string, unknown>;
  return (
    <ApprovalWorkflow
      definition={definition}
      state={String(record[definition.stateKey])}
      availableActions={(record.availableActions as string[] | undefined) ?? []}
      history={history?.transitions}
      busy={isLoading}
      hiddenStates={wf.hiddenStates?.(perm)}
      onTransition={async (action, comment) => {
        try {
          await transition(wf.transition.toArg(row.id, action, comment)).unwrap();
          toast.success('Done');
        } catch (e) {
          toast.error(e);
          throw e;
        }
      }}
    />
  );
}
