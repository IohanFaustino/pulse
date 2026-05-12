import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoadingSkeleton, { SkeletonRect, SkeletonCircle, SkeletonCard, SkeletonGrid } from './index'

describe('LoadingSkeleton', () => {
  it('SkeletonRect renders', () => {
    render(<SkeletonRect />)
    expect(screen.getByTestId('skeleton-rect')).toBeInTheDocument()
  })

  it('SkeletonCircle renders', () => {
    render(<SkeletonCircle />)
    expect(screen.getByTestId('skeleton-circle')).toBeInTheDocument()
  })

  it('SkeletonCard renders', () => {
    render(<SkeletonCard />)
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument()
  })

  it('SkeletonGrid renders N cards', () => {
    render(<SkeletonGrid count={4} />)
    const cards = screen.getAllByTestId('skeleton-card')
    expect(cards).toHaveLength(4)
  })

  it('default export has all primitives', () => {
    expect(LoadingSkeleton.Rect).toBeDefined()
    expect(LoadingSkeleton.Circle).toBeDefined()
    expect(LoadingSkeleton.Card).toBeDefined()
    expect(LoadingSkeleton.Grid).toBeDefined()
  })

  it('SkeletonRect accepts custom width and height', () => {
    render(<SkeletonRect width="60%" height="2rem" />)
    const el = screen.getByTestId('skeleton-rect')
    expect(el).toHaveStyle({ width: '60%', height: '2rem' })
  })
})
