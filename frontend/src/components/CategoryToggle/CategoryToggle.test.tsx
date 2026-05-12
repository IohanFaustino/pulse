import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CategoryToggle, { CATEGORIES } from './index'

describe('CategoryToggle', () => {
  it('renders the pill button', () => {
    render(<CategoryToggle selected="Todos" onSelect={vi.fn()} />)
    expect(screen.getByTestId('category-toggle-pill')).toBeInTheDocument()
  })

  it('chips are not visible before click', () => {
    render(<CategoryToggle selected="Todos" onSelect={vi.fn()} />)
    expect(screen.queryByTestId('category-chips')).not.toBeInTheDocument()
  })

  it('expands chips on pill click', async () => {
    const user = userEvent.setup()
    render(<CategoryToggle selected="Todos" onSelect={vi.fn()} />)
    await user.click(screen.getByTestId('category-toggle-pill'))
    expect(screen.getByTestId('category-chips')).toBeInTheDocument()
  })

  it('renders all 9 category chips when expanded', async () => {
    const user = userEvent.setup()
    render(<CategoryToggle selected="Todos" onSelect={vi.fn()} />)
    await user.click(screen.getByTestId('category-toggle-pill'))
    for (const cat of CATEGORIES) {
      expect(screen.getByTestId(`category-chip-${cat}`)).toBeInTheDocument()
    }
  })

  it('marks the selected chip with aria-selected="true"', async () => {
    const user = userEvent.setup()
    render(<CategoryToggle selected="Inflação" onSelect={vi.fn()} />)
    await user.click(screen.getByTestId('category-toggle-pill'))
    const inflacaoChip = screen.getByTestId('category-chip-Inflação')
    expect(inflacaoChip).toHaveAttribute('aria-selected', 'true')
  })

  it('fires onSelect with the chosen category', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<CategoryToggle selected="Todos" onSelect={onSelect} />)
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Juros'))
    expect(onSelect).toHaveBeenCalledWith('Juros')
  })

  it('collapses chips after selecting a category', async () => {
    const user = userEvent.setup()
    render(<CategoryToggle selected="Todos" onSelect={vi.fn()} />)
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Câmbio'))
    expect(screen.queryByTestId('category-chips')).not.toBeInTheDocument()
  })

  it('pill shows totalCount when provided', () => {
    render(<CategoryToggle selected="Todos" onSelect={vi.fn()} totalCount={25} />)
    expect(screen.getByTestId('category-toggle-pill').textContent).toContain('25')
  })

  it('pill aria-expanded is false when collapsed', () => {
    render(<CategoryToggle selected="Todos" onSelect={vi.fn()} />)
    expect(screen.getByTestId('category-toggle-pill')).toHaveAttribute('aria-expanded', 'false')
  })

  it('pill aria-expanded is true when expanded', async () => {
    const user = userEvent.setup()
    render(<CategoryToggle selected="Todos" onSelect={vi.fn()} />)
    await user.click(screen.getByTestId('category-toggle-pill'))
    expect(screen.getByTestId('category-toggle-pill')).toHaveAttribute('aria-expanded', 'true')
  })
})
