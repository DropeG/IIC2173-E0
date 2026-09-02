# Entrega 0 - Arquitectura de Sistemas de Software

## Consideraciones generales
Hola! Todo el proyecto está levantado en una máquina EC2. Para la orquestación usé Docker Compose (que levanta la base de datos Postgres, la API y el conector). Respetando el enunciado, instalé Nginx directamente en el sistema operativo de Ubuntu (no en Docker) para que actúe como proxy inverso. 

## Nombre del dominio
https://dropeg.duckdns.org

## Método de acceso al servidor
El archivo `.pem` lo dejé en el buzón de entrega de Canvas para cumplir con la regla de no subirlo a GitHub. Para conectarse a la máquina, se debe usar este comando en la terminal donde tengan guardado el archivo:

```bash
chmod 400 e0-key.pem
ssh -i e0-key.pem ubuntu@3.93.180.52
```

---

## Puntos logrados - Parte Mínima

* **RF1 a RF4 (API y Filtros): Logrados.** 
  La API guarda todo en Postgres y pagina cada 25 eventos por defecto. También recibe filtros por propiedades, por ejemplo: `https://dropeg.duckdns.org/history?receivedAt=2026-09-01`.
* **RNF1 (Resiliencia): Logrado.** 
  El conector corre en su propio contenedor. Le hace POST al master y tiene lógica para reintentar la conexión automáticamente si RabbitMQ se cae, sin botar la API principal.
* **RNF2 (Docker y Redes): Logrado.** 
  Todos los contenedores comparten la red interna `energyshark_net`.
* **RNF3 (Proxy inverso host): Logrado.** 
  Nginx está en la máquina EC2 y redirige al puerto interno.
* **RNF4 (Dominio): Logrado.** 
  Uso DuckDNS apuntando a la IP elástica.
* **RNF5 (Máquina EC2): Logrado.** 
  Se usó una instancia `t3.micro` (capa gratuita).
* **RNF6 (Docker Compose): Logrado.** 
  Todo el ecosistema se levanta desde el `docker-compose.yml` en la raíz.
* **RNF7 (Healthchecks): Logrados.** 
  El master usa `curl`, la DB usa `pg_isready` y para el conector usé "file checking" (crea/toca un archivo `/tmp/heartbeat` para avisar que no se ha quedado pegado).

---

## Puntos logrados - Parte Variable
Decidí implementar ambos grupos variables para asegurar puntaje.

### 1. HTTPS (15p)
* **Logrado.** Usé Certbot para generar el SSL con Let's Encrypt. 
* Si entran por HTTP normal, Nginx hace la redirección automática a HTTPS. 
* La renovación automática (2 veces al día) se configuró sola al instalar Certbot en Ubuntu mediante su propio *systemd timer*.

### 2. Balanceo de Carga con Nginx (15p)
* **Logrado.** En el `docker-compose.yml` cloné el contenedor principal en `master1` (pto 3000) y `master2` (pto 3001). 
* En la configuración de Nginx agregué un bloque `upstream` que reparte el tráfico (Load Balancing) entre ambas instancias para no saturar una sola.

---
**Nota sobre uso de IA:** Me apoyé en herramientas de IA como asistente de programación para consultar dudas sobre comandos de bash de Linux, depurar errores de red en Docker y generar la estructura base de Nginx.
