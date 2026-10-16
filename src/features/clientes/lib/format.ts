const dateFmt = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' })

/** "14 oct 2026" en hora de Lima. */
export function formatLimaDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

/** "1 compra" / "3 compras". */
export function purchasesLabel(n: number): string {
  return `${n} ${n === 1 ? 'compra' : 'compras'}`
}
