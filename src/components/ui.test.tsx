import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Alert, Empty } from './ui'

describe('componentes base', () => {
  it('Alert de error usa role="alert" (accesibilidad)', () => {
    render(<Alert>Algo falló</Alert>)
    expect(screen.getByRole('alert').textContent).toBe('Algo falló')
  })
  it('Empty muestra el mensaje de pantalla vacía', () => {
    render(<Empty>No hay datos</Empty>)
    expect(screen.getByText('No hay datos')).toBeTruthy()
  })
})
