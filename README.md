# Racha

Registro diario de hábitos en una sola pantalla. Marca cada día lo que cumpliste (agua, ejercicio, lectura…) y mira tu constancia en una cuadrícula de un año al estilo GitHub, con contador de días consecutivos.

- Sin registro ni servidor: los datos se guardan en el `localStorage` del navegador.
- Racha global (días con todos los hábitos cumplidos) y racha por hábito.
- Cuadrícula de 53 semanas, filtrable por hábito; pulsa un día para editarlo.
- Copia de seguridad: copia y restaura tus datos como texto JSON.
- Tema claro y oscuro, usable en móvil y con teclado.

## Uso

Abre `index.html` en el navegador. No hay dependencias ni paso de compilación.

La primera vez se cargan datos de ejemplo; pulsa **Empezar de cero** para usar la app con tus propios hábitos.

# Llavero

Probador de API keys de IA en `llavero.html`. Pega una llave y comprueba si funciona, qué modelos desbloquea y cómo responde un modelo a un mensaje de prueba.

- Proveedores: OpenAI, Anthropic, Google Gemini, Groq, Mistral, OpenRouter, DeepSeek, xAI, Together, Cohere y cualquier servidor compatible con OpenAI (Ollama, LM Studio…).
- Detecta el proveedor por el prefijo de la llave (`sk-ant-`, `AIza`, `gsk_`, `sk-or-`…).
- La petición va directa del navegador al proveedor; el historial solo guarda llaves enmascaradas.
- Si un proveedor bloquea las llamadas desde webs (CORS), copia el comando cURL y pruébala desde la terminal.
