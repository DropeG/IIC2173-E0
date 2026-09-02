# Entrega 0 - Arquitectura de Sistemas de Software

## Consideraciones Generales
El proyecto fue construido siguiendo estrictamente la rúbrica y utilizando prácticas de Infraestructura como Código. Toda la orquestación (Base de datos, API y Conector) se maneja a través de un único archivo `docker-compose.yml`. El Proxy Inverso (Nginx) y la seguridad SSL fueron configurados de manera nativa (bare-metal) sobre el sistema operativo Ubuntu de la instancia EC2, respetando la restricción de no incluir Nginx en los contenedores. 

Además del grupo variable obligatorio, **se implementaron ambos grupos variables** (HTTPS y Balanceo de Carga) para asegurar máxima resiliencia.

## Nombre del Dominio
👉 **https://dropeg.duckdns.org**

## Método de Acceso al Servidor (SSH)
El archivo `.pem` con la llave privada ha sido adjuntado exclusivamente en el buzón de entrega de Canvas por motivos de seguridad. Para ingresar al servidor EC2 y auditar la máquina, utilice el siguiente comando desde su terminal:

```bash
# Otorgue permisos a la llave primero (si es necesario)
chmod 400 e0-key.pem

# Acceso SSH
ssh -i e0-key.pem ubuntu@3.93.180.52
```

---

## Checklist de Evaluación (Parte Mínima)

* ✅ **RF1 a RF4 (API HTTP y Base de Datos):** **Logrado**. La API almacena los eventos en PostgreSQL. Soporta paginación por defecto (`?page=1&limit=25`) y filtros por cualquier propiedad (ej: `/history?receivedAt=2026-09-01` o `/history?city=Hogwarts`).
* ✅ **RNF1 (Resiliencia del Conector):** **Logrado**. El conector funciona en un contenedor independiente. Se comunica con el master usando `HTTP POST`. Soporta caídas del broker mediante eventos `close`/`error` de AMQP y rutinas de auto-reconexión (`setTimeout`). Su caída no afecta a la API web.
* ✅ **RNF2 (Containerización y Red):** **Logrado**. Todos los servicios operan bajo una red privada interna (`energyshark_net`). El conector resuelve al master por su nombre de red interna, sin salir a internet.
* ✅ **RNF3 (Proxy Inverso Nativo):** **Logrado**. Nginx fue instalado nativamente en el host (Ubuntu) con `apt-get`, NO en Docker. Intercepta el tráfico externo y lo rutea a localhost.
* ✅ **RNF4 (Dominio):** **Logrado**. El dominio `dropeg.duckdns.org` apunta a la IP elástica de EC2.
* ✅ **RNF5 (Capa Gratuita EC2):** **Logrado**. El servidor corre sobre una instancia de EC2 `t3.micro` (Free Tier).
* ✅ **RNF6 (Docker Compose):** **Logrado**. Un solo comando `docker compose up` despliega la BD (con persistencia de volúmenes), la API y el Conector simultáneamente.
* ✅ **RNF7 (Healthchecks):** **Logrado**. Se implementaron healthchecks precisos:
  - `master`: Mediante `curl` a `/health`.
  - `db`: Mediante `pg_isready`.
  - `connector`: Mediante *file checking*. El conector toca el archivo `/tmp/heartbeat` periódicamente sin exponer APIs web innecesarias.

---

## Checklist de Evaluación (Parte Variable)

Aunque la rúbrica exigía elegir solo uno, **se lograron AMBOS grupos (30 puntos)**:

### Grupo 1: HTTPS (25%)
* ✅ **RNF1 (Certificado Let's Encrypt):** **Logrado**. El dominio está asegurado con candado SSL gestionado vía Certbot.
* ✅ **RNF2 (Redirección HTTP a HTTPS):** **Logrado**. Nginx intercepta peticiones al puerto 80 y retorna un HTTP 301 Redirect hacia HTTPS.
* ✅ **RNF3 (Renovación Automática):** **Logrado**. Se configuró automáticamente un systemd timer (`certbot.timer`) de Ubuntu que se ejecuta 2 veces al día en background verificando la expiración.

### Grupo 2: Balanceo de Carga con Nginx (25%)
* ✅ **RF1 (Replicar Master):** **Logrado**. El servicio `master` fue dividido en `master1` (puerto 3000) y `master2` (puerto 3001) corriendo en paralelo desde Docker Compose.
* ✅ **RF2 (Alcanzables desde Nginx):** **Logrado**. El archivo de Nginx en el host expone un bloque `upstream` que balancea la carga equitativamente entre las dos instancias internas (Round Robin).

---
*Declaración de IA: El diseño arquitectónico, los scripts bash de despliegue automatizado y la configuración de Nginx fueron asistidos iterativamente utilizando Agentes IA (Claude/Gemini) bajo un esquema de trabajo de "Infrastructure as Code".*
