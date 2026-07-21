// Content for the "Build your own x402 API" guide — free web edition + paid
// PDF edition, in 3 languages. No secrets anywhere: every credential
// mentioned is a placeholder or a "get your own free token" pointer.

const CODE_SAMPLE = `import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";

const app = express();
const facilitator = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
const resourceServer = new x402ResourceServer(facilitator)
  .register("solana:<CAIP-2-network-id>", new ExactSvmScheme());

app.use(paymentMiddleware(
  { "GET /my-endpoint": { accepts: { scheme: "exact", price: "$0.01", network: "solana:...", payTo: "YOUR_WALLET" } } },
  resourceServer
));

app.get("/my-endpoint", (req, res) => res.json({ valuable: "data" }));
app.listen(3000);`;

export const GUIDE_LANGS = {
  es: {
    code: "es", label: "Español", flag: "🇪🇸",
    title: "Construye y lanza tu propia API x402",
    subtitle: "La guía en español que no existía — con el caso real de Toolrail, bugs incluidos.",
    checklistHeading: "Checklist de arranque",
    ctaHeading: "📄 Llévatela en PDF — con checklist imprimible",
    ctaBody: "La misma guía, tipografiada para lectura offline, más el checklist de arranque completo (9 puntos) en una página que puedes pegar junto a tu monitor.",
    ctaBullets: [
      "✓ Los 12 capítulos completos, sin publicidad",
      "✓ Checklist de arranque completo, listo para imprimir",
      "✓ Tuya para siempre — sin suscripción",
      "✓ Pagas en USDC vía x402 (Base o Solana) — el mismo protocolo que enseña la guía, en acción",
    ],
    ctaNote: "Al abrir el enlace, tu cliente x402 (o curl, para ver el desafío de pago) recibirá el 402 con las instrucciones de pago — igual que cualquier endpoint de Toolrail.",
    ctaButton: "Generar mi PDF",
    checklistPreviewNote: "… 6 puntos más en la versión PDF imprimible ↓",
    kicker: "GUÍA GRATUITA",
    footer: "Esta guía documenta un caso real; no es asesoría financiera ni legal.",
    sections: [
      {
        id: "intro", title: "1. Por qué esto importa ahora",
        paragraphs: [
          "x402 es un protocolo de pago abierto, construido sobre el código HTTP 402 (\"Payment Required\") que existía en el estándar desde los años 90 sin que nadie lo usara. Coinbase lo revivió: cuando un agente de IA llama a una API sin pagar, el servidor responde 402 con instrucciones de pago legibles por máquina; el agente paga en USDC (stablecoin, siempre vale $1) por Base o Solana, reintenta, y recibe el recurso. Todo en segundos, sin cuentas, sin API keys.",
          "El mercado creció de casi cero a más de 100 millones de transacciones acumuladas en menos de un año, con Visa, Mastercard, Google y Stripe uniéndose a la Fundación x402 en julio de 2026. Sigue siendo temprano — la mediana de los ~22.000 servicios listados gana centavos al mes — pero temprano es la palabra clave: quien construye ahora entra con historial cuando el mercado madure.",
          "Esta guía documenta, paso a paso, cómo construimos Toolrail (toolrail.dev): una API real, en producción, cobrando dinero real en dos redes, con datos oficiales de siete países latinoamericanos. No es teoría — es el camino que caminamos, con los errores que cometimos y cómo los arreglamos.",
        ],
      },
      {
        id: "arquitectura", title: "2. La arquitectura mínima que funciona",
        paragraphs: [
          "Un servidor x402 no necesita nada exótico: un servidor HTTP normal (usamos Express/Node.js, pero el protocolo es agnóstico de lenguaje) con un middleware de pago delante de tus rutas. La pieza clave es el 'resource server': un objeto que sabe qué redes acepta, qué esquema de pago usa ('exact' es el estándar: precio fijo por llamada) y a qué dirección de wallet debe llegar el dinero.",
          "El flujo interno en cuatro pasos: (1) la petición llega a tu servidor, (2) el middleware de pago revisa si trae comprobante de pago válido, (3) si no lo trae, corta la petición y responde 402 con un JSON codificado en base64 dentro de una cabecera describiendo cuánto cuesta y a quién pagarle, (4) si sí lo trae, verifica el pago contra un 'facilitador' (un servicio intermediario que confirma en la blockchain que el pago es real) y deja pasar la petición a tu código normal.",
        ],
        code: CODE_SAMPLE,
      },
      {
        id: "bug-red", title: "3. El primer bug real: testnet vs. devnet de Solana",
        paragraphs: [
          "Esto nos costó una hora el primer día, y te la ahorramos. Solana tiene TRES redes de prueba con nombres confusos: 'devnet', 'testnet' y 'mainnet' (la real). El identificador que usamos al configurar la red importa letra por letra — usamos el de 'testnet' y el deploy falló con un error de 'facilitador no soporta este esquema en esta red', porque el facilitador gratuito de x402.org solo soporta 'devnet' para pruebas, no 'testnet'.",
          "La lección generalizable: antes de fijar cualquier identificador de red, consulta el endpoint /supported de tu facilitador (todo facilitador serio lo expone) y usa exactamente lo que ahí aparece. No confíes en la documentación general del protocolo — confía en lo que tu facilitador específico soporta hoy.",
        ],
      },
      {
        id: "facilitador", title: "4. Elegir facilitador: pruebas vs. producción",
        paragraphs: [
          "Para desarrollar y probar, el facilitador gratuito de x402.org basta y no requiere cuenta. Para producción — dinero real, y aparecer automáticamente en el índice de descubrimiento ('Bazaar') de Coinbase — necesitas el facilitador de Coinbase Developer Platform (CDP), que se activa con una cuenta gratuita y un par de llaves API.",
          "Un detalle que documentamos porque no está claro en ningún lado: para que el Bazaar te catalogue de verdad (no solo proceses pagos), tu servidor debe registrar explícitamente la extensión de descubrimiento (bazaarResourceServerExtension del paquete @x402/extensions) en el resource server. Sin esa línea, puedes estar cobrando perfectamente y aun así ser invisible en el índice — lo descubrimos por accidente revisando la documentación con lupa después de varios días.",
        ],
      },
      {
        id: "catalogo", title: "5. Cómo elegir QUÉ vender: el filtro de 3 preguntas",
        paragraphs: ["Antes de programar un solo endpoint, pásalo por este filtro. Un dato o cálculo vale la pena venderlo si cumple las tres condiciones:"],
        bullets: [
          "¿Un agente lo necesita a mitad de una tarea? (no es curiosidad — bloquea el paso siguiente: \"no puedo emitir la factura sin el tipo de cambio\")",
          "¿Es doloroso de mantener uno mismo? (tablas que cambian cada mes, reglas legisladas, formatos que se rompen — nadie quiere ser dueño de eso)",
          "¿No existe una fuente gratuita confiable y estable? (o la que existe se cae seguido — la confiabilidad ES el producto)",
        ],
        paragraphs2: [
          "Con ese filtro descartamos ideas atractivas pero equivocadas: datos de redes sociales (scraping en zona legal gris — los términos de servicio de la mayoría de plataformas prohíben explícitamente revender el acceso), sanciones internacionales (ya lo hacía bien otro servicio del ecosistema, entrar tercero no suma), sueldos mínimos regionales sin fuente verificable al día. Y encontramos oro donde nadie miraba: unidades de indexación de bancos centrales latinoamericanos, validación de identificadores tributarios de siete países, un agregador de tipos de cambio oficiales — nada de eso lo servía nadie más en todo el ecosistema.",
        ],
      },
      {
        id: "fuentes", title: "6. De dónde sacar datos sin meterte en problemas",
        paragraphs: [
          "La regla de oro: fuentes oficiales o con licencia abierta explícita, nunca scraping de páginas que no lo autorizan. Antes de conectar cualquier fuente, verificamos tres cosas: (1) ¿el dato es un hecho público (un tipo de cambio oficial, un feriado legislado) o contenido con derechos de autor? Los hechos oficiales no tienen dueño. (2) ¿Existe una API o dataset publicado con licencia abierta (MIT, dominio público) o son datos internos protegidos por términos de servicio? (3) Si usamos un proyecto de un tercero, les avisamos y ofrecemos atribución — construye relaciones, no solo código.",
          "Ejemplo de lo que evitamos: la API de YouTube prohíbe explícitamente revender el acceso a sus datos sin permiso escrito de Google, y las transcripciones ni siquiera están en su API oficial. Ejemplo de lo que sí hicimos: bancos centrales que publican sus series históricas en JSON abierto, sin necesitar ni siquiera una clave — ahí no hay ambigüedad posible.",
          "Truco de investigador: cuando un banco central no documenta una API pública, abre su propio sitio web, mira en las herramientas de desarrollador del navegador qué llamadas hace su propio gráfico interactivo — casi siempre existe un endpoint interno JSON, sin key, que su equipo de frontend ya usa. Es 100% legítimo: es la misma data que muestran públicamente, solo que sin documentar formalmente.",
        ],
      },
      {
        id: "bug-json", title: "7. El segundo bug real: JSON que no es JSON",
        paragraphs: [
          "Una de nuestras fuentes (un banco central) tiene un backend antiguo en PHP que, ocasionalmente, agrega volcados de advertencias de PHP DESPUÉS del JSON válido — cientos de caracteres de HTML de error pegados al final de una respuesta que, hasta ese punto, era JSON perfecto. JSON.parse() estándar falla con eso.",
          "La solución no es 'esperar que no pase' — es defensiva: en vez de confiar en dónde termina la respuesta, contamos llaves { } balanceadas desde el primer '{' hasta que el contador vuelve a cero, y parseamos solo ese fragmento. Además, en fines de semana esa misma fuente devuelve el texto \"n.d.\" en vez de un número — así que caminamos hacia atrás en la serie histórica hasta encontrar el último valor numérico real.",
          "La lección: cuando integres una fuente gubernamental o de infraestructura antigua, NUNCA asumas que su JSON es JSON válido garantizado. Escribe el parser a la defensiva desde el día uno, con reintentos y extracción tolerante a basura.",
        ],
      },
      {
        id: "bug-csp", title: "8. El tercer bug real: la seguridad que se mordió la cola",
        paragraphs: [
          "Después de una auditoría de seguridad, agregamos una política CSP (Content-Security-Policy) muy estricta a nuestra página: 'default-src none' — bloquea cualquier recurso no autorizado explícitamente. Perfecto para bloquear scripts maliciosos... excepto que también bloqueó silenciosamente nuestro propio ícono de pestaña del navegador, declarado con un simple <link rel=\"icon\"> en la misma página.",
          "Nadie lo notó en los tests automáticos porque el servidor entregaba el archivo perfectamente — el bloqueo ocurría en el navegador del visitante, no en nuestro servidor. Lo encontramos porque alguien insistió en probar en dos navegadores distintos y modo incógnito antes de aceptar 'debe ser el caché'. La solución fue una línea: agregar 'img-src self' a la política.",
          "La lección: cuando endurezcas la seguridad de una página, prueba CADA recurso que la propia página necesita cargar, no solo los que quieres bloquear.",
        ],
      },
      {
        id: "seguridad", title: "9. Checklist de seguridad para producción",
        paragraphs: ["Lo mínimo que aplicamos antes de anunciar el servicio públicamente:"],
        bullets: [
          "Límite de tasa por IP (evita que una inundación de peticiones tumbe el servidor gratis)",
          "Cabeceras de seguridad: HSTS, X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy",
          "Sanitizar cualquier credencial (tokens, API keys) que pudiera aparecer en mensajes de error",
          "Si generas PDFs o renderizas HTML de terceros: deshabilita JavaScript y bloquea peticiones de red durante el render",
          "Manejador de errores que nunca exponga stack traces ni rutas internas — siempre JSON limpio y genérico hacia afuera",
          "Verifica tu propio historial de git en busca de secretos commiteados por accidente antes de hacer el repositorio público",
        ],
      },
      {
        id: "deploy", title: "10. Deploy: de tu computador a internet en una tarde",
        paragraphs: [
          "Usamos Render.com con Docker: un plan gratuito basta para probar, un plan de ~$7 USD/mes para producción real (el gratuito 'duerme' tras inactividad, lo que agrega segundos de latencia a la primera llamada). Si tu servicio genera PDFs o hace capturas de pantalla, tu Dockerfile necesita instalar Chromium.",
          "El ciclo completo que usamos en cada cambio: escribir código → correr pruebas automáticas localmente → si pasan, subir a git → Render despliega automáticamente por el webhook → verificar desde afuera con curl que el cambio llegó a producción. Nunca confiar en que 'debería haber funcionado' — siempre verificar el resultado real.",
        ],
      },
      {
        id: "descubrimiento", title: "11. Que te encuentren: los 5 canales reales",
        bullets: [
          "El índice Bazaar de Coinbase: automático tras tu primer pago liquidado a través de su facilitador",
          "Directorios comunitarios (como x402-list.com): formulario de envío, prueban tus endpoints automáticamente",
          "Listas curadas en GitHub (como awesome-x402): se contribuye vía pull request",
          "x402scan y exploradores similares: indexan automáticamente según actividad on-chain real",
          "Un archivo /.well-known/x402.json en tu dominio: convención que permite a rastreadores automatizados descubrir tu catálogo",
        ],
        paragraphs2: [
          "Ninguno de estos reemplaza la distribución humana: comunidades de Discord del ecosistema, foros de desarrolladores locales, y — si tu nicho tiene un aliado natural — el contacto directo genuino, ofreciendo algo de valor real en el mensaje.",
        ],
      },
      {
        id: "realidad", title: "12. La realidad de los números (sin inflar nada)",
        paragraphs: [
          "Sé honesto contigo mismo antes de empezar: la mediana de los servicios x402 gana centavos al mes. El mercado creció rapidísimo pero sigue siendo joven — la mayoría de las llamadas de valor alto (más de $1) se concentran en un puñado de servicios establecidos.",
          "El valor real de construir ahora no es el ingreso inmediato — es la posición: historial acumulado en los índices de descubrimiento, aprendizaje profundo de una infraestructura que recién está madurando. Trátalo como una apuesta barata y bien pensada, no como un plan de ingresos garantizado.",
        ],
      },
    ],
    checklist: [
      "Elige tu nicho con el filtro de 3 preguntas (sección 5) antes de escribir código",
      "Verifica la licencia/términos de cada fuente de datos antes de conectarla",
      "Configura el facilitador de pruebas (x402.org) primero; nunca actives dinero real sin probar el flujo completo",
      "Registra la extensión de descubrimiento del Bazaar si usarás el facilitador de Coinbase",
      "Escribe parsers defensivos para cualquier fuente externa (asume que su JSON puede venir roto)",
      "Aplica el checklist de seguridad de la sección 9 antes de anunciar públicamente",
      "Verifica cada endpoint gratuito de tu página contra tus propias políticas de seguridad",
      "Publica en al menos 2 de los 5 canales de descubrimiento de la sección 11",
      "Ajusta tus expectativas de ingreso con datos reales, no con el mejor escenario posible",
    ],
  },

  en: {
    code: "en", label: "English", flag: "🇺🇸",
    title: "Build and ship your own x402 API",
    subtitle: "A real-world walkthrough — the Toolrail case study, bugs included.",
    checklistHeading: "Launch checklist",
    ctaHeading: "📄 Get the PDF edition — with a printable checklist",
    ctaBody: "The same guide, typeset for offline reading, plus the full 9-point launch checklist on a page you can pin next to your monitor.",
    ctaBullets: [
      "✓ All 12 chapters, no ads",
      "✓ Full printable launch checklist",
      "✓ Yours forever — no subscription",
      "✓ Pay in USDC via x402 (Base or Solana) — the very protocol the guide teaches, in action",
    ],
    ctaNote: "Opening the link, your x402 client (or curl, to see the payment challenge) will get the 402 with payment instructions — same as any Toolrail endpoint.",
    ctaButton: "Generate my PDF",
    checklistPreviewNote: "… 6 more items in the printable PDF edition ↓",
    kicker: "FREE GUIDE",
    footer: "This guide documents a real case; it is not financial or legal advice.",
    sections: [
      {
        id: "intro", title: "1. Why this matters right now",
        paragraphs: [
          "x402 is an open payment protocol built on the HTTP 402 (\"Payment Required\") status code, which sat unused in the standard since the 90s. Coinbase revived it: when an AI agent calls an API without paying, the server replies 402 with machine-readable payment instructions; the agent pays in USDC (a stablecoin, always worth $1) on Base or Solana, retries, and gets the resource. All in seconds — no accounts, no API keys.",
          "The market grew from near-zero to over 100 million cumulative transactions in under a year, with Visa, Mastercard, Google and Stripe joining the x402 Foundation in July 2026. It's still early — the median of the ~22,000 listed services earns cents per month — but early is the operative word: whoever builds now enters with a track record once the market matures.",
          "This guide documents, step by step, how we built Toolrail (toolrail.dev): a real API, in production, charging real money on two networks, serving official data from seven Latin American countries. This isn't theory — it's the path we actually walked, mistakes and fixes included.",
        ],
      },
      {
        id: "arquitectura", title: "2. The minimal architecture that works",
        paragraphs: [
          "An x402 server needs nothing exotic: a normal HTTP server (we used Express/Node.js, though the protocol is language-agnostic) with a payment middleware in front of your routes. The key piece is the 'resource server': an object that knows which networks it accepts, which payment scheme it uses ('exact' is the standard: a fixed price per call), and which wallet address the money should reach.",
          "The internal flow in four steps: (1) the request hits your server, (2) the payment middleware checks whether it carries valid proof of payment, (3) if not, it short-circuits and responds 402 with base64-encoded JSON in a header describing the price and payee, (4) if it does, it verifies the payment against a 'facilitator' (an intermediary that confirms on-chain that the payment is real) and lets the request through to your normal code.",
        ],
        code: CODE_SAMPLE,
      },
      {
        id: "bug-red", title: "3. Real bug #1: Solana testnet vs. devnet",
        paragraphs: [
          "This cost us an hour on day one — we'll save you the trouble. Solana has THREE test networks with confusingly similar names: 'devnet', 'testnet', and 'mainnet' (the real one). The identifier you use when configuring your network matters down to the letter — we used 'testnet' and the deploy failed with 'facilitator does not support this scheme on this network', because the free x402.org facilitator only supports 'devnet' for testing, not 'testnet'.",
          "The generalizable lesson: before hardcoding any network identifier, query your facilitator's /supported endpoint (every serious facilitator exposes one) and use exactly what's listed there. Don't trust the protocol's general documentation — trust what your specific facilitator supports today.",
        ],
      },
      {
        id: "facilitador", title: "4. Choosing a facilitator: testing vs. production",
        paragraphs: [
          "For development and testing, the free x402.org facilitator is enough and needs no account. For production — real money, and automatic listing in Coinbase's discovery index ('Bazaar') — you need the Coinbase Developer Platform (CDP) facilitator, activated with a free account and an API key pair.",
          "One detail we're documenting because it's unclear anywhere else: for the Bazaar to actually catalog you (not just process payments), your server must explicitly register the discovery extension (bazaarResourceServerExtension from the @x402/extensions package) on the resource server. Without that line, you can be charging perfectly and still be invisible in the index — we found this by accident, reading the documentation with a magnifying glass after several days.",
        ],
      },
      {
        id: "catalogo", title: "5. Choosing WHAT to sell: the 3-question filter",
        paragraphs: ["Before writing a single endpoint, run it through this filter. A piece of data or a calculation is worth selling if it meets all three conditions:"],
        bullets: [
          "Does an agent need it mid-task? (not curiosity — it blocks the next step: \"I can't issue the invoice without the exchange rate\")",
          "Is it painful to maintain yourself? (tables that change monthly, legislated rules, formats that break — nobody wants to own that)",
          "Is there no stable, trustworthy free source? (or the one that exists goes down often — reliability IS the product)",
        ],
        paragraphs2: [
          "That filter helped us discard attractive but wrong ideas: social-media data (legal gray-zone scraping — most platforms' terms explicitly forbid reselling access), international sanctions screening (another service in the ecosystem already did it well), regional minimum wages without a source we could verify as current. And we found gold where nobody was looking: Latin American central-bank indexed units, tax-ID validation for seven countries, an official FX rate aggregator — nothing like that existed anywhere else in the whole ecosystem.",
        ],
      },
      {
        id: "fuentes", title: "6. Where to get data without landing in trouble",
        paragraphs: [
          "The golden rule: official sources or explicit open licenses, never scraping pages that don't authorize it. Before connecting any source, we check three things: (1) Is the data a public fact (an official exchange rate, a legislated holiday) or copyrighted content? Official facts have no owner. (2) Does an openly licensed API or dataset exist (MIT, public domain), or is it internal data protected by terms of service? (3) If we use a third party's project, we notify them and offer attribution — build relationships, not just code.",
          "An example of what we avoided: YouTube's API explicitly forbids reselling access to its data without Google's written permission, and transcripts aren't even in the official API. An example of what we did do: central banks that publish their historical series as open JSON, no key required — zero ambiguity there.",
          "Researcher's trick: when a central bank doesn't document a public API, open its own website and check, in your browser's developer tools, what calls its own interactive chart makes — there's almost always an internal, keyless JSON endpoint that its own frontend team already uses. It's 100% legitimate: it's the same data they show publicly, just not formally documented.",
        ],
      },
      {
        id: "bug-json", title: "7. Real bug #2: JSON that isn't JSON",
        paragraphs: [
          "One of our sources (a central bank) runs an old PHP backend that occasionally appends PHP warning dumps AFTER the valid JSON — hundreds of characters of error HTML tacked onto the end of a response that, up to that point, was perfect JSON. Standard JSON.parse() chokes on that.",
          "The fix isn't 'hope it doesn't happen' — it's defensive: instead of trusting where the response ends, we count balanced { } braces from the first '{' until the counter returns to zero, and parse only that fragment. Also, on weekends that same source returns the text \"n.d.\" instead of a number — so we walk backward through the historical series until we find the last real numeric value.",
          "The lesson: when integrating a government or legacy-infrastructure source, NEVER assume its JSON is guaranteed valid JSON. Write the parser defensively from day one, with retries and garbage-tolerant extraction.",
        ],
      },
      {
        id: "bug-csp", title: "8. Real bug #3: the security that bit its own tail",
        paragraphs: [
          "After a security audit, we added a strict CSP (Content-Security-Policy) to our page: 'default-src none' — blocks any resource not explicitly authorized. Perfect for blocking malicious scripts... except it also silently blocked our own browser-tab icon, declared with a plain <link rel=\"icon\"> on the very same page.",
          "Nobody caught it in automated tests because the server served the file perfectly — the block happened in the visitor's browser, not on our server. We found it because someone insisted on testing in two different browsers and incognito mode before accepting 'must be caching'. The fix was one line: adding 'img-src self' to the policy.",
          "The lesson: when hardening a page's security, test EVERY resource the page itself needs to load, not just the ones you want to block.",
        ],
      },
      {
        id: "seguridad", title: "9. Production security checklist",
        paragraphs: ["The minimum we apply before announcing a service publicly:"],
        bullets: [
          "Per-IP rate limiting (stops a request flood from taking down your free-tier server)",
          "Security headers: HSTS, X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy",
          "Sanitize any credential (tokens, API keys) that could leak into error messages",
          "If you render PDFs or third-party HTML: disable JavaScript and block network requests during rendering",
          "An error handler that never exposes stack traces or internal paths — always clean, generic JSON outward",
          "Check your own git history for accidentally committed secrets before making the repo public",
        ],
      },
      {
        id: "deploy", title: "10. Deploy: from your laptop to the internet in an afternoon",
        paragraphs: [
          "We use Render.com with Docker: a free plan is enough to test, a ~$7 USD/month plan for real production (the free tier 'sleeps' after inactivity, adding seconds of latency to the first call). If your service generates PDFs or screenshots, your Dockerfile needs Chromium installed.",
          "The full cycle we use for every change: write code → run automated tests locally → if they pass, push to git → Render auto-deploys via webhook → verify from outside with curl that the change reached production. Never trust that something 'should have worked' — always verify the real result.",
        ],
      },
      {
        id: "descubrimiento", title: "11. Getting found: the 5 real channels",
        bullets: [
          "Coinbase's Bazaar index: automatic after your first payment settles through its facilitator",
          "Community directories (like x402-list.com): submission form, they probe your endpoints automatically",
          "Curated GitHub lists (like awesome-x402): contribute via pull request",
          "x402scan and similar explorers: index automatically based on real on-chain activity",
          "A /.well-known/x402.json file on your domain: a convention letting automated crawlers discover your catalog",
        ],
        paragraphs2: [
          "None of these replace human distribution: ecosystem Discord communities, local developer forums, and — if your niche has a natural ally — genuine direct outreach, offering real value in the message.",
        ],
      },
      {
        id: "realidad", title: "12. The reality of the numbers (nothing inflated)",
        paragraphs: [
          "Be honest with yourself before starting: the median x402 service earns cents per month. The market grew extremely fast but is still young — most high-value calls (over $1) concentrate on a handful of established services.",
          "The real value of building now isn't immediate income — it's positioning: accumulated track record in discovery indexes, deep learning of an infrastructure that's just maturing. Treat it as a cheap, well-considered bet, not a guaranteed income plan.",
        ],
      },
    ],
    checklist: [
      "Pick your niche with the 3-question filter (section 5) before writing code",
      "Verify the license/terms of every data source before connecting it",
      "Set up the testing facilitator (x402.org) first; never enable real money without testing the full flow",
      "Register the Bazaar discovery extension if you'll use the Coinbase facilitator",
      "Write defensive parsers for any external source (assume its JSON can arrive broken)",
      "Apply the section 9 security checklist before announcing publicly",
      "Test every free endpoint on your page against your own security policies",
      "Publish on at least 2 of the 5 discovery channels from section 11",
      "Calibrate your income expectations with real data, not the best-case scenario",
    ],
  },

  pt: {
    code: "pt", label: "Português", flag: "🇧🇷",
    title: "Construa e lance sua própria API x402",
    subtitle: "O guia com o caso real do Toolrail — bugs incluídos.",
    checklistHeading: "Checklist de lançamento",
    ctaHeading: "📄 Leve em PDF — com checklist para imprimir",
    ctaBody: "O mesmo guia, formatado para leitura offline, mais o checklist de lançamento completo (9 pontos) em uma página que você pode colar ao lado do monitor.",
    ctaBullets: [
      "✓ Os 12 capítulos completos, sem anúncios",
      "✓ Checklist de lançamento completo, pronto para imprimir",
      "✓ Seu para sempre — sem assinatura",
      "✓ Pague em USDC via x402 (Base ou Solana) — o mesmo protocolo que o guia ensina, em ação",
    ],
    ctaNote: "Ao abrir o link, seu cliente x402 (ou curl, para ver o desafio de pagamento) receberá o 402 com as instruções de pagamento — igual a qualquer endpoint do Toolrail.",
    ctaButton: "Gerar meu PDF",
    checklistPreviewNote: "… mais 6 itens na edição em PDF para imprimir ↓",
    kicker: "GUIA GRATUITO",
    footer: "Este guia documenta um caso real; não é aconselhamento financeiro nem jurídico.",
    sections: [
      {
        id: "intro", title: "1. Por que isso importa agora",
        paragraphs: [
          "x402 é um protocolo de pagamento aberto, construído sobre o código HTTP 402 (\"Payment Required\"), que existia no padrão desde os anos 90 sem que ninguém o usasse. A Coinbase o reviveu: quando um agente de IA chama uma API sem pagar, o servidor responde 402 com instruções de pagamento legíveis por máquina; o agente paga em USDC (stablecoin, sempre vale $1) via Base ou Solana, tenta novamente e recebe o recurso. Tudo em segundos, sem contas, sem chaves de API.",
          "O mercado cresceu de quase zero para mais de 100 milhões de transações acumuladas em menos de um ano, com Visa, Mastercard, Google e Stripe se juntando à Fundação x402 em julho de 2026. Ainda é cedo — a mediana dos ~22.000 serviços listados ganha centavos por mês — mas cedo é a palavra-chave: quem constrói agora entra com histórico quando o mercado amadurecer.",
          "Este guia documenta, passo a passo, como construímos o Toolrail (toolrail.dev): uma API real, em produção, cobrando dinheiro de verdade em duas redes, com dados oficiais de sete países latino-americanos. Não é teoria — é o caminho que percorremos, com os erros que cometemos e como os corrigimos.",
        ],
      },
      {
        id: "arquitectura", title: "2. A arquitetura mínima que funciona",
        paragraphs: [
          "Um servidor x402 não precisa de nada exótico: um servidor HTTP normal (usamos Express/Node.js, mas o protocolo é agnóstico de linguagem) com um middleware de pagamento na frente das suas rotas. A peça-chave é o 'resource server': um objeto que sabe quais redes aceita, qual esquema de pagamento usa ('exact' é o padrão: preço fixo por chamada) e para qual endereço de carteira o dinheiro deve chegar.",
          "O fluxo interno em quatro passos: (1) a requisição chega ao seu servidor, (2) o middleware de pagamento verifica se ela traz comprovante de pagamento válido, (3) se não trouxer, interrompe e responde 402 com um JSON codificado em base64 dentro de um cabeçalho descrevendo o preço e para quem pagar, (4) se trouxer, verifica o pagamento junto a um 'facilitator' (um intermediário que confirma na blockchain que o pagamento é real) e deixa a requisição passar para o seu código normal.",
        ],
        code: CODE_SAMPLE,
      },
      {
        id: "bug-red", title: "3. O primeiro bug real: testnet vs. devnet da Solana",
        paragraphs: [
          "Isso nos custou uma hora no primeiro dia — vamos poupar você. A Solana tem TRÊS redes de teste com nomes parecidos e confusos: 'devnet', 'testnet' e 'mainnet' (a real). O identificador que você usa ao configurar a rede importa letra por letra — usamos o de 'testnet' e o deploy falhou com um erro de 'facilitator não suporta este esquema nesta rede', porque o facilitator gratuito do x402.org só suporta 'devnet' para testes, não 'testnet'.",
          "A lição generalizável: antes de fixar qualquer identificador de rede, consulte o endpoint /supported do seu facilitator (todo facilitator sério o expõe) e use exatamente o que aparece ali. Não confie na documentação geral do protocolo — confie no que o seu facilitator específico suporta hoje.",
        ],
      },
      {
        id: "facilitador", title: "4. Escolhendo o facilitator: testes vs. produção",
        paragraphs: [
          "Para desenvolver e testar, o facilitator gratuito do x402.org basta e não exige conta. Para produção — dinheiro real, e aparecer automaticamente no índice de descoberta ('Bazaar') da Coinbase — você precisa do facilitator da Coinbase Developer Platform (CDP), ativado com uma conta gratuita e um par de chaves de API.",
          "Um detalhe que documentamos porque não está claro em lugar nenhum: para que o Bazaar realmente catalogue você (não apenas processe pagamentos), seu servidor deve registrar explicitamente a extensão de descoberta (bazaarResourceServerExtension do pacote @x402/extensions) no resource server. Sem essa linha, você pode estar cobrando perfeitamente e mesmo assim ser invisível no índice — descobrimos isso por acaso, revisando a documentação com lupa depois de vários dias.",
        ],
      },
      {
        id: "catalogo", title: "5. Como escolher O QUE vender: o filtro de 3 perguntas",
        paragraphs: ["Antes de programar um único endpoint, passe-o por este filtro. Um dado ou cálculo vale a pena vender se cumprir as três condições:"],
        bullets: [
          "Um agente precisa disso no meio de uma tarefa? (não é curiosidade — bloqueia o próximo passo: \"não posso emitir a fatura sem a taxa de câmbio\")",
          "É doloroso manter isso sozinho? (tabelas que mudam todo mês, regras legisladas, formatos que quebram — ninguém quer ser dono disso)",
          "Não existe uma fonte gratuita confiável e estável? (ou a que existe cai com frequência — a confiabilidade É o produto)",
        ],
        paragraphs2: [
          "Com esse filtro descartamos ideias atraentes mas erradas: dados de redes sociais (scraping em zona cinzenta legal — os termos de serviço da maioria das plataformas proíbem explicitamente revender o acesso), triagem de sanções internacionais (outro serviço do ecossistema já fazia isso bem, entrar como terceiro não somaria), salários mínimos regionais sem fonte verificável em dia. E encontramos ouro onde ninguém olhava: unidades de indexação de bancos centrais latino-americanos, validação de identificadores fiscais de sete países, um agregador de taxas de câmbio oficiais — nada disso era oferecido por ninguém em todo o ecossistema.",
        ],
      },
      {
        id: "fuentes", title: "6. Onde buscar dados sem se meter em problemas",
        paragraphs: [
          "A regra de ouro: fontes oficiais ou com licença aberta explícita, nunca scraping de páginas que não autorizam. Antes de conectar qualquer fonte, verificamos três coisas: (1) o dado é um fato público (uma taxa de câmbio oficial, um feriado legislado) ou conteúdo com direitos autorais? Fatos oficiais não têm dono. (2) Existe uma API ou dataset publicado com licença aberta (MIT, domínio público) ou são dados internos protegidos por termos de serviço? (3) Se usamos o projeto de terceiros, avisamos e oferecemos atribuição — construa relacionamentos, não só código.",
          "Exemplo do que evitamos: a API do YouTube proíbe explicitamente revender o acesso aos seus dados sem permissão por escrito do Google, e as transcrições nem sequer estão na API oficial. Exemplo do que fizemos: bancos centrais que publicam suas séries históricas em JSON aberto, sem precisar sequer de uma chave — ali não há ambiguidade possível.",
          "Truque de pesquisador: quando um banco central não documenta uma API pública, abra o próprio site e veja, nas ferramentas de desenvolvedor do navegador, quais chamadas seu próprio gráfico interativo faz — quase sempre existe um endpoint interno em JSON, sem chave, que a equipe de frontend deles já usa. É 100% legítimo: é o mesmo dado que mostram publicamente, só que sem documentação formal.",
        ],
      },
      {
        id: "bug-json", title: "7. O segundo bug real: JSON que não é JSON",
        paragraphs: [
          "Uma das nossas fontes (um banco central) roda um backend antigo em PHP que, ocasionalmente, anexa despejos de avisos do PHP DEPOIS do JSON válido — centenas de caracteres de HTML de erro colados ao final de uma resposta que, até aquele ponto, era JSON perfeito. O JSON.parse() padrão falha com isso.",
          "A solução não é 'esperar que não aconteça' — é defensiva: em vez de confiar em onde a resposta termina, contamos chaves { } balanceadas a partir do primeiro '{' até o contador voltar a zero, e fazemos o parse só desse trecho. Além disso, nos fins de semana essa mesma fonte devolve o texto \"n.d.\" em vez de um número — então caminhamos para trás na série histórica até achar o último valor numérico real.",
          "A lição: ao integrar uma fonte governamental ou de infraestrutura antiga, NUNCA assuma que o JSON dela é garantidamente válido. Escreva o parser de forma defensiva desde o primeiro dia, com retries e extração tolerante a lixo.",
        ],
      },
      {
        id: "bug-csp", title: "8. O terceiro bug real: a segurança que mordeu o próprio rabo",
        paragraphs: [
          "Depois de uma auditoria de segurança, adicionamos uma política CSP (Content-Security-Policy) bem estrita à nossa página: 'default-src none' — bloqueia qualquer recurso não autorizado explicitamente. Perfeito para bloquear scripts maliciosos... exceto que também bloqueou silenciosamente nosso próprio ícone da aba do navegador, declarado com um simples <link rel=\"icon\"> na mesma página.",
          "Ninguém percebeu nos testes automáticos porque o servidor entregava o arquivo perfeitamente — o bloqueio acontecia no navegador do visitante, não no nosso servidor. Descobrimos porque alguém insistiu em testar em dois navegadores diferentes e modo anônimo antes de aceitar 'deve ser cache'. A correção foi uma linha: adicionar 'img-src self' à política.",
          "A lição: ao endurecer a segurança de uma página, teste TODO recurso que a própria página precisa carregar, não só os que você quer bloquear.",
        ],
      },
      {
        id: "seguridad", title: "9. Checklist de segurança para produção",
        paragraphs: ["O mínimo que aplicamos antes de anunciar o serviço publicamente:"],
        bullets: [
          "Limite de taxa por IP (evita que uma inundação de requisições derrube o servidor gratuito)",
          "Cabeçalhos de segurança: HSTS, X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy",
          "Higienizar qualquer credencial (tokens, chaves de API) que possa vazar em mensagens de erro",
          "Se você gera PDFs ou renderiza HTML de terceiros: desative JavaScript e bloqueie requisições de rede durante a renderização",
          "Um tratador de erros que nunca exponha stack traces nem caminhos internos — sempre JSON limpo e genérico para fora",
          "Verifique seu próprio histórico do git em busca de segredos commitados por acidente antes de tornar o repositório público",
        ],
      },
      {
        id: "deploy", title: "10. Deploy: do seu computador para a internet em uma tarde",
        paragraphs: [
          "Usamos Render.com com Docker: um plano gratuito basta para testar, um plano de ~$7 USD/mês para produção real (o gratuito 'dorme' após inatividade, adicionando segundos de latência à primeira chamada). Se o seu serviço gera PDFs ou capturas de tela, seu Dockerfile precisa instalar o Chromium.",
          "O ciclo completo que usamos a cada mudança: escrever código → rodar testes automáticos localmente → se passarem, subir para o git → o Render implanta automaticamente via webhook → verificar de fora com curl que a mudança chegou à produção. Nunca confie que algo 'deveria ter funcionado' — sempre verifique o resultado real.",
        ],
      },
      {
        id: "descubrimiento", title: "11. Para te encontrarem: os 5 canais reais",
        bullets: [
          "O índice Bazaar da Coinbase: automático após seu primeiro pagamento liquidado através do facilitator deles",
          "Diretórios comunitários (como x402-list.com): formulário de envio, testam seus endpoints automaticamente",
          "Listas curadas no GitHub (como awesome-x402): contribui-se via pull request",
          "x402scan e exploradores parecidos: indexam automaticamente conforme atividade real on-chain",
          "Um arquivo /.well-known/x402.json no seu domínio: convenção que permite a rastreadores automatizados descobrir seu catálogo",
        ],
        paragraphs2: [
          "Nenhum desses substitui a distribuição humana: comunidades no Discord do ecossistema, fóruns de desenvolvedores locais, e — se o seu nicho tiver um aliado natural — o contato direto genuíno, oferecendo valor real na mensagem.",
        ],
      },
      {
        id: "realidad", title: "12. A realidade dos números (sem inflar nada)",
        paragraphs: [
          "Seja honesto consigo mesmo antes de começar: a mediana dos serviços x402 ganha centavos por mês. O mercado cresceu muito rápido mas ainda é jovem — a maioria das chamadas de alto valor (mais de $1) se concentra em um punhado de serviços já estabelecidos.",
          "O valor real de construir agora não é a renda imediata — é o posicionamento: histórico acumulado nos índices de descoberta, aprendizado profundo de uma infraestrutura que está apenas amadurecendo. Trate isso como uma aposta barata e bem pensada, não como um plano de renda garantida.",
        ],
      },
    ],
    checklist: [
      "Escolha seu nicho com o filtro de 3 perguntas (seção 5) antes de escrever código",
      "Verifique a licença/termos de cada fonte de dados antes de conectá-la",
      "Configure o facilitator de testes (x402.org) primeiro; nunca ative dinheiro real sem testar o fluxo completo",
      "Registre a extensão de descoberta do Bazaar se for usar o facilitator da Coinbase",
      "Escreva parsers defensivos para qualquer fonte externa (assuma que o JSON pode vir quebrado)",
      "Aplique o checklist de segurança da seção 9 antes de anunciar publicamente",
      "Teste cada endpoint gratuito da sua página contra suas próprias políticas de segurança",
      "Publique em pelo menos 2 dos 5 canais de descoberta da seção 11",
      "Calibre suas expectativas de renda com dados reais, não com o melhor cenário possível",
    ],
  },
};

export const DEFAULT_LANG = "es";
export const LANG_LIST = Object.values(GUIDE_LANGS);
