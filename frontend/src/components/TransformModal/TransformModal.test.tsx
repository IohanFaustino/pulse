import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TransformModal from './index'

const defaultProps = {
  code: 'IPCA',
  name: 'IPCA',
  onApply: vi.fn(),
  onCancel: vi.fn(),
}

describe('TransformModal', () => {
  it('renders all 5 groups', () => {
    render(<TransformModal {...defaultProps} />)
    expect(screen.getByTestId('group-original')).toBeInTheDocument()
    expect(screen.getByTestId('group-variacao')).toBeInTheDocument()
    expect(screen.getByTestId('group-suavizacao')).toBeInTheDocument()
    expect(screen.getByTestId('group-janelas')).toBeInTheDocument()
    expect(screen.getByTestId('group-normalizacao')).toBeInTheDocument()
  })

  it('pre-selects "level" by default', () => {
    render(<TransformModal {...defaultProps} />)
    expect(screen.getByTestId('radio-level')).toBeChecked()
  })

  it('pre-selects currentSpec op when provided', () => {
    render(<TransformModal {...defaultProps} currentSpec={{ op: 'yoy' }} />)
    expect(screen.getByTestId('radio-yoy')).toBeChecked()
  })

  it('Aplicar button fires onApply with TransformSpec shape', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<TransformModal {...defaultProps} onApply={onApply} />)
    await user.click(screen.getByTestId('modal-apply-btn'))
    expect(onApply).toHaveBeenCalledOnce()
    const arg = onApply.mock.calls[0][0] as { op: string; params?: unknown }
    expect(arg).toHaveProperty('op')
    expect(typeof arg.op).toBe('string')
  })

  it('emits correct TransformSpec for yoy', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<TransformModal {...defaultProps} onApply={onApply} />)
    await user.click(screen.getByTestId('radio-yoy'))
    await user.click(screen.getByTestId('modal-apply-btn'))
    expect(onApply).toHaveBeenCalledWith({ op: 'yoy' })
  })

  it('emits ma with window=3 for ma_3', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<TransformModal {...defaultProps} onApply={onApply} />)
    await user.click(screen.getByTestId('radio-ma_3'))
    await user.click(screen.getByTestId('modal-apply-btn'))
    expect(onApply).toHaveBeenCalledWith({ op: 'ma', params: { window: 3 } })
  })

  it('emits ma with window=12 for ma_12', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<TransformModal {...defaultProps} onApply={onApply} />)
    await user.click(screen.getByTestId('radio-ma_12'))
    await user.click(screen.getByTestId('modal-apply-btn'))
    expect(onApply).toHaveBeenCalledWith({ op: 'ma', params: { window: 12 } })
  })

  it('shows ewma span input when ewma is selected', async () => {
    const user = userEvent.setup()
    render(<TransformModal {...defaultProps} />)
    await user.click(screen.getByTestId('radio-ewma'))
    expect(screen.getByTestId('ewma-span-input')).toBeInTheDocument()
  })

  it('shows rebase base input when rebase is selected', async () => {
    const user = userEvent.setup()
    render(<TransformModal {...defaultProps} />)
    await user.click(screen.getByTestId('radio-rebase'))
    expect(screen.getByTestId('rebase-base-input')).toBeInTheDocument()
  })

  it('Cancelar fires onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<TransformModal {...defaultProps} onCancel={onCancel} />)
    await user.click(screen.getByTestId('modal-cancel-btn'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('clicking scrim fires onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<TransformModal {...defaultProps} onCancel={onCancel} />)
    await user.click(screen.getByTestId('transform-modal-scrim'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('renders code and name in header', () => {
    render(<TransformModal {...defaultProps} code="SELIC" name="Taxa SELIC" />)
    expect(screen.getByText('SELIC')).toBeInTheDocument()
    expect(screen.getByText(/Taxa SELIC/)).toBeInTheDocument()
  })
})
