import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmptyState from './index'

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="Nenhum índice fixado" />)
    expect(screen.getByText('Nenhum índice fixado')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(
      <EmptyState title="Vazio" subtitle="Adicione índices na página Índices." />,
    )
    expect(screen.getByText('Adicione índices na página Índices.')).toBeInTheDocument()
  })

  it('does not render subtitle when omitted', () => {
    render(<EmptyState title="Vazio" />)
    expect(
      screen.queryByText('Adicione índices na página Índices.'),
    ).not.toBeInTheDocument()
  })

  it('renders CTA button when ctaLabel is provided', () => {
    render(<EmptyState title="Vazio" ctaLabel="Ir para Índices" />)
    expect(screen.getByTestId('empty-state-cta')).toBeInTheDocument()
    expect(screen.getByText('Ir para Índices')).toBeInTheDocument()
  })

  it('does not render CTA button when ctaLabel is omitted', () => {
    render(<EmptyState title="Vazio" />)
    expect(screen.queryByTestId('empty-state-cta')).not.toBeInTheDocument()
  })

  it('fires onAction when CTA is clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<EmptyState title="Vazio" ctaLabel="Agir" onAction={onAction} />)
    await user.click(screen.getByTestId('empty-state-cta'))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('renders with role="status" for accessibility', () => {
    render(<EmptyState title="Vazio" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
