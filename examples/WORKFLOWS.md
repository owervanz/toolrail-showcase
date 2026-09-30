# Tres workflows gratuitos de Toolrail

Convierte un monto UF en un reporte con fecha y fuente, valida un lote de RUT o prepara un reporte de plazos. Son ejemplos ejecutables con las herramientas MCP existentes, no endpoints nuevos.

## Preparación

En una carpeta nueva, con Node.js 22 o posterior:

```sh
npm init -y
npm install @modelcontextprotocol/sdk@1.30.0
```

Guarda en esa carpeta estos archivos:

- [workflows.mjs](https://toolrail.dev/assets/examples/workflows.mjs)
- [ruts.example.json](https://toolrail.dev/assets/examples/ruts.example.json)
- [deadlines.example.json](https://toolrail.dev/assets/examples/deadlines.example.json)

No necesitas cuenta, wallet, clave API ni suscripción. Comparte el cupo de **30 llamadas por cliente anónimo y día UTC** con la demo del navegador y las otras integraciones. El alojamiento gratuito puede tardar hasta aproximadamente un minuto en despertar. El ejemplo espera hasta 90 segundos al conectar y hasta 60 segundos por herramienta; no reintenta automáticamente.

## 1. Reporte de un monto UF

```sh
node workflows.mjs uf 50
```

Una llamada. Devuelve el monto en CLP, valor UF, fecha, fuente y señal `stale`. Usa la UF que entrega `cl_uf` en ese momento; este ejemplo MCP no permite elegir una fecha histórica. No se deben fijar de antemano los pesos: cambian con la fecha de la UF. Si aparece `stale`, revisa la fecha y la fuente antes de usar el resultado.

## 2. Validación de un lote de RUT

```sh
node workflows.mjs ruts ruts.example.json
```

El JSON es una lista de 1 a 10 cadenas; una llamada por fila. Los ejemplos son datos ilustrativos. Un RUT con checksum incorrecto produce una fila procesada con `valid: false`, no una falla técnica del workflow. Se valida formato y dígito verificador; no se verifica existencia, identidad ni inscripción tributaria.

No uses nombres u otros datos personales en el archivo. Los RUT se envían por HTTPS al servidor MCP y aparecen en tu reporte local; evita publicarlos. Toolrail no añade sus valores al panel de métricas. Para guardar resultados, redirige la salida a un archivo privado:

```sh
node workflows.mjs ruts ruts.example.json > reporte-ruts.json
```

## 3. Reporte de plazos

```sh
node workflows.mjs plazos deadlines.example.json
```

Una llamada por fila, máximo 10. Cada fila incluye `desde`, `plazo` y opcionalmente `tipo`: `administrativo`, `habil-bancario` o `corrido`. Cuenta desde el día siguiente; entrega fecha final, feriados saltados, fecha de revisión del calendario y alcance. Los tipos hábiles usan el calendario nacional **2026–2027**. Fuera de esa cobertura, el servidor devuelve un error; el ejemplo no inventa calendarios. No aplica reglas especiales del procedimiento ni feriados regionales.

Para el ejemplo `2026-09-30 + 10` días administrativos, la fecha final es `2026-10-15`, saltando el feriado `2026-10-12`. Para `2026-12-30 + 2` días hábiles bancarios, la fecha final es `2027-01-05`, saltando el cierre bancario del 31 de diciembre y Año Nuevo.

## Errores y resultados parciales

El reporte incluye `status`, `calls_attempted`, `unprocessed_rows` y el resultado de cada fila. `TOOL_ERROR` incluye errores MCP aunque HTTP haya sido 200; `INVALID_RESPONSE` indica contenido incompleto o inconsistente; `TRANSPORT_ERROR` detiene el lote. Las filas pendientes no se presentan como procesadas. La ejecución termina con código 1 ante errores o resultados parciales; `valid: false` de un RUT no es un error técnico.

Valida todo el lote antes de llamar. Envía las filas secuencialmente y no reintenta; cada ejecución puede volver a consumir cuota. No añadas reintentos automáticos sin controlar el cupo y la causa del fallo.

`TOOLRAIL_MCP_URL` permite apuntar a otra instalación HTTPS o a `http://localhost:PUERTO/mcp` para pruebas. No admite credenciales en URL, query strings ni fragmentos. Cambiar la URL cambia el destinatario de los datos: úsalo conscientemente.

[Demo web](https://toolrail.dev/probar) · [Integración](https://toolrail.dev/integrar) · [Ejemplo básico](https://toolrail.dev/assets/examples/MCP-README.md)
