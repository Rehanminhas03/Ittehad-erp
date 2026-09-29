import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EntityViewConfig, Page } from '@/shared/entity';
import { meWith, renderWithStore } from '@/test/renderWithStore';
import { EntityListView } from './EntityListView';

interface Row {
  id: number;
  name: string;
}

function configWith(page: Page<Row>, useList = vi.fn(() => ({ data: page, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }))) {
  const noop = () => [vi.fn(), { isLoading: false }] as const;
  const config: EntityViewConfig<Row> = {
    singular: 'Thing',
    plural: 'Things',
    basePath: '/things',
    entityType: 'test.thing',
    permissions: { view: ['test.things.view'], create: 'test.things.create' },
    list: { defaultSort: 'name', columns: [{ key: 'name', header: 'Name', sortKey: 'name' }] },
    detail: { title: (r) => r.name, fields: [] },
    api: {
      useList,
      useGet: vi.fn(),
      create: { useMutation: noop, toArg: (v) => v },
    },
  };
  return { config, useList };
}

describe('EntityListView', () => {
  it('renders server rows and requests page 1 with the default sort', () => {
    const { config, useList } = configWith({ items: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }], total: 2, page: 1, pageSize: 25 });
    renderWithStore(<EntityListView config={config} />, { me: meWith(['test.things.view']) });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    // The count is split across nested elements (the range is bolded); match on combined text.
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '1–2 of 2')).toBeInTheDocument();
    expect(useList).toHaveBeenCalledWith({ page: 1, pageSize: 25, sort: 'name' });
  });

  it('hides the create action without the create permission', () => {
    const { config } = configWith({ items: [], total: 0, page: 1, pageSize: 25 });
    renderWithStore(<EntityListView config={config} />, { me: meWith(['test.things.view']) });
    expect(screen.queryByRole('button', { name: /new thing/i })).not.toBeInTheDocument();
    expect(screen.getByText('No things found')).toBeInTheDocument();
  });

  it('shows the create action with the create permission', () => {
    const { config } = configWith({ items: [], total: 0, page: 1, pageSize: 25 });
    renderWithStore(<EntityListView config={config} />, { me: meWith(['test.things.view', 'test.things.create']) });
    expect(screen.getByRole('button', { name: /new thing/i })).toBeInTheDocument();
  });

  it('passes URL state (page, sort, search) to the server query', () => {
    const { config, useList } = configWith({ items: [], total: 0, page: 3, pageSize: 25 });
    renderWithStore(<EntityListView config={config} />, { me: meWith(['test.things.view']), route: '/?page=3&sort=-name&q=abc' });
    expect(useList).toHaveBeenCalledWith({ page: 3, pageSize: 25, sort: '-name', q: 'abc' });
  });
});
