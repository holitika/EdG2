# Bitácora EdG · cómo publicarla

Esta carpeta es el proyecto completo: la web (public/), las funciones de acceso y guardado (api/) y los datos del plan (data/). Se publica en Vercel.

## Publicar (una sola vez, unos 10 minutos)

1. Descomprime la carpeta y ábrela en una terminal.
2. Ejecuta `npx vercel`. Inicia sesión, acepta crear un proyecto nuevo y ponle el nombre `bitacora-edg`. Deja las opciones por defecto (no hay paso de build).
3. En el panel de Vercel, entra al proyecto y abre Storage. Crea un Blob store con acceso **Private** y conéctalo al proyecto. Eso crea solo la variable `BLOB_READ_WRITE_TOKEN`.
4. En Settings, Environment Variables, agrega `ADMIN_TOKEN` con una clave larga que solo tú conozcas (por ejemplo, 24 letras y números al azar).
5. Ejecuta `npx vercel --prod` para publicar con las variables ya cargadas.
6. Abre `https://TU-PROYECTO.vercel.app/admin.html`, escribe tu clave y crea los códigos de acceso. Cada código es para una persona.

## Cómo funciona

- Cada persona entra con su código (EDG-XXXX-XXXX). El código identifica su avance: lo puede abrir desde el celular y el computador.
- La primera vez elige su fecha de inicio, la fecha del examen y los días de la semana en que estudia. El plan se genera solo.
- Desde la pestaña Carpeta de estudio descarga el .zip y el prompt para su IA, y su plan en CSV.
- En /admin.html puedes desactivar un código (deja de entrar y de guardar) o reactivarlo.

## Cambiar el contenido

- Carpeta de estudio: reemplaza `data/carpeta-estudio.zip` y vuelve a publicar. Dentro hay una carpeta `material` vacía: si decides incluir PDF de clases y manuales, agrégalos al zip antes de publicar.
- Prompt del tutor: edita `data/prompt_inicio.md`.
- Plan, preguntas y clases: están en `data/template.json`.

## Notas

- Los datos de cada persona se guardan en el Blob store, en archivos privados con el nombre de su código.
- Si vas a cobrar, lo más simple es entregar el código por mensaje una vez recibido el pago. Más adelante se puede automatizar con Mercado Pago o Flow.


## Límite de dispositivos
Cada código funciona en 1 dispositivo (variable opcional `MAX_DEVICES` para cambiar el límite). Si alguien cambia de celular o computador, en /admin.html usa «Liberar dispositivos» en su código.

## Carpeta de estudio
`data/carpeta-estudio.zip` (2 MB) trae el material completo en texto. Debe pesar menos de 4,5 MB, que es el límite de respuesta de una función de Vercel.

## Señales de uso compartido
En /admin.html cada código muestra el tipo de aparato (por ejemplo «iPhone · Safari»), cuántos intentos fueron bloqueados por el límite, cuántas veces se liberó y cuántas veces se descargó el material. No se guarda IP ni ubicación.
