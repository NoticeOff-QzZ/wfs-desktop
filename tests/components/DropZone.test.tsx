// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DropZone from '../../src/components/DropZone'

describe('DropZone', () => {
  it('passes every selected file to the upload queue', () => {
    const onFiles = vi.fn()
    const { container } = render(
      <DropZone onFiles={onFiles} hasImage={false} remaining={3} disabled={false} />,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ]

    fireEvent.change(input, { target: { files } })
    expect(onFiles).toHaveBeenCalledWith(files)
  })
})
