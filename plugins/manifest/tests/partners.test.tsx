// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartnerProfileForm } from '../ui/PartnerProfile';

afterEach(cleanup);
describe('partner evidence profile', () => {
 it('preserves the edit version and distinguishes a website claim from verification', async () => {
  const save = vi.fn(async () => true);
  render(<PartnerProfileForm version="v1" canEdit busy={false} onSave={save}/>);
  const selectors = screen.getAllByLabelText('Уровень подтверждения');
  fireEvent.change(selectors[3]!, {target:{value:'claimed'}});
  const notes = screen.getAllByLabelText('Сведения и проверенные доказательства');
  fireEvent.change(notes[3]!, {target:{value:'Website offers VAT support; documents not checked'}});
  fireEvent.click(screen.getByText('Сохранить профиль партнёра'));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]?.[0]).toMatchObject({capabilities:{vat:{status:'claimed'}}});
  expect(save.mock.calls[0]?.[1]).toBe('v1');
 });
 it('requires reloading instead of overwriting a concurrent update', () => {
  const save = vi.fn(async () => true);
  const p = {mode:'unknown' as const, capabilities:{}, notes:'old'};
  const v = render(<PartnerProfileForm profile={p} version="v1" canEdit busy={false} onSave={save}/>);
  fireEvent.change(screen.getByLabelText('Условия, ограничения и следующий вопрос'), {target:{value:'unsaved'}});
  v.rerender(<PartnerProfileForm profile={{...p,notes:'new from agent'}} version="v2" canEdit busy={false} onSave={save}/>);
  expect((screen.getByText('Сохранить профиль партнёра') as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('Условия, ограничения и следующий вопрос') as HTMLTextAreaElement).value).toBe('unsaved');
  fireEvent.click(screen.getByText('Загрузить актуальный профиль'));
  expect((screen.getByLabelText('Условия, ограничения и следующий вопрос') as HTMLTextAreaElement).value).toBe('new from agent');
  expect(save).not.toHaveBeenCalled();
 });
});
