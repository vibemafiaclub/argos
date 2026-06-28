import * as React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ContextSection } from './context-section'

// Mock useId to return a stable ID
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    useId: () => 'mock-id-123'
  }
})

describe('ContextSection', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders title and toggle button correctly', () => {
    render(<ContextSection title="Test Title">Test Content</ContextSection>)

    expect(screen.getByText('Test Title')).toBeTruthy()
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBe('mock-id-123')
  })

  it('toggles content visibility on click', () => {
    render(<ContextSection title="Test Title"><p data-testid="content">Test Content</p></ContextSection>)

    expect(screen.queryByText('Test Content')).toBeNull()

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Test Content')).toBeTruthy()

    const contentContainer = screen.getByTestId('content').parentElement
    expect(contentContainer?.getAttribute('id')).toBe('mock-id-123')

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Test Content')).toBeNull()
  })

  it('respects defaultOpen prop', () => {
    render(
      <ContextSection title="Test Title" defaultOpen={true}>
        Test Content
      </ContextSection>
    )

    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Test Content')).toBeTruthy()
  })
})
