# Consulta Datos RUC/DNI - SUNAT

API para consultar datos de RUC y DNI desde SUNAT mediante web scraping.

## Rutas disponibles

- `POST /sunat` - Consultar información de RUC o DNI

## Estructura de la petición

```json
{
  "tipo": "ruc", // o "dni", "ce", "pasaporte", "diplomatico"
  "documento": "20131312955" // Número de documento
}
