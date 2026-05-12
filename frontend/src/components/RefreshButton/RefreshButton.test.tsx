/**
 * RefreshButton tests — verifies click triggers the correct mutation.
 *
 * Mocks the useAdmin hooks; asserts that:
 *   - With no `code` prop, click invokes `useBackfill().mutate(undefined)`.
 *   - With a `code` prop, click invokes `useExtractOne().mutate(code)`.
 *   - Loading state disables the button + shows "Atualizando…".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockBackfillMutate = vi.fn()
const mockExtractMutate = vi.fn()
let backfillState = { isPending: false, isSuccess: false, isError: false }
let extractState = { isPending: false, isSuccess: false, isError: false }

vi.mock('@/hooks/useAdmin', () => ({
  useBackfill: () => ({ mutate: mockBackfillMutate, ...backfillState }),
  useExtractOne: () => ({ mutate: mockExtractMutate, ...extractState }),
}))

import RefreshButton from './index'

beforeEach(() => {
  mockBackfillMutate.mockReset()
  mockExtractMutate.mockReset()
  backfillState = { isPending: false, isSuccess: false, isError: false }
  extractState = { isPending: false, isSuccess: false, isError: false }
})

describe('RefreshButton', () => {
  it('calls backfill mutate with undefined when no code provided', async () => {
    render(<RefreshButton />)
    await userEvent.click(screen.getByTestId('refresh-button'))
    expect(mockBackfillMutate).toHaveBeenCalledWith(undefined)
    expect(mockExtractMutate).not.toHaveBeenCalled()
  })

  it('calls extract mutate with code when code prop provided', async () => {
    render(<RefreshButton code="IPCA" />)
    await userEvent.click(screen.getByTestId('refresh-button'))
    expect(mockExtractMutate).toHaveBeenCalledWith('IPCA')
    expect(mockBackfillMutate).not.toHaveBeenCalled()
  })

  it('renders idle label "Atualizar"', () => {
    render(<RefreshButton />)
    expect(screen.getByTestId('refresh-button').textContent).toContain('Atualizar')
  })

  it('shows loading state and disables button when pending', () => {
    backfillState = { isPending: true, isSuccess: false, isError: false }
    render(<RefreshButton />)
    const btn = screen.getByTestId('refresh-button')
    expect(btn).toBeDisabled()
    expect(btn.textContent).toContain('Atualizando')
  })
})
