// Caracteres de control (\p{Cc}: saltos, tab...) y de formato (\p{Cf}: U+200B, U+202E...) no
// tienen sitio en un nombre, teléfono o dirección: permiten falsear lo que se ve en pantalla,
// boletas y CSV (p. ej. invertir el texto con U+202E). Compartido por Clientes y Configuración.
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u

export const NO_CONTROL_MESSAGE = 'No uses caracteres invisibles o de control'

export const noControl = (v: string) => !CONTROL_OR_FORMAT.test(v)
