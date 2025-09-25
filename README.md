# QDraw Visual Editor

¡Bienvenido a QDraw Visual Editor! Una herramienta de programación visual diseñada para crear, probar y visualizar programas escritos en el lenguaje QDraw. Construye secuencias de comandos de dibujo y movimiento en un lienzo interactivo y observa cómo tu código cobra vida paso a paso.

## ¿Cómo Usar la Aplicación?

La interfaz se divide en dos secciones principales: el **Panel Izquierdo** (Paleta de Comandos y Controles) y el **Panel Derecho** (Lienzo de Dibujo y Editor de Código).

---

### Panel Izquierdo: Paleta de Comandos y Controles

Aquí es donde construirás tu programa. Simplemente haz clic en los botones para añadir comandos a la secuencia actual.

#### 1. Mis Procedimientos
- **Descripción:** Una vez que defines un procedimiento (un conjunto de comandos guardado con un nombre), aparecerá en esta sección.
- **Uso:** Haz clic en el nombre de un procedimiento para añadir una llamada a ese procedimiento en tu programa principal. Esto te permite reutilizar código de forma sencilla.

#### 2. Comandos y Movimiento
- **Pintar (Negro, Rojo, Verde):** Pinta la celda actual donde se encuentra el cursor con el color seleccionado.
- **Limpiar:** Borra el color de la celda actual, dejándola transparente.
- **Movimiento (Arriba, Abajo, Izquierda, Derecha):** Mueve el cursor una celda en la dirección especificada. Si intentas moverte fuera de los límites del lienzo, se mostrará un error temporal.

#### 3. Condiciones
- **Descripción:** Son sensores que verifican el estado de la celda actual. Se utilizan junto con la estructura `Si`.
- **Condiciones Disponibles:**
  - `estaVacia?`: Verdadero si la celda no tiene color.
  - `estaPintadaDeNegro?`: Verdadero si la celda es negra.
  - `estaPintadaDeRojo?`: Verdadero si la celda es roja.
  - `estaPintadaDeVerde?`: Verdadero si la celda es verde.
- **Uso:** Selecciona una condición haciendo clic en ella (se iluminará). Luego, presiona el botón `Añadir Si` para crear un bloque condicional.

#### 4. Estructuras
- **Añadir Repetir:** Crea un bucle que repetirá un bloque de comandos un número determinado de veces. Puedes ajustar el número de repeticiones en el campo numérico.
- **Añadir Si:** Añade un bloque condicional. Los comandos dentro de este bloque solo se ejecutarán si la condición que seleccionaste previamente es verdadera.
- **Añadir Sino:** Añade un bloque alternativo a un `Si` previo. Los comandos dentro del `Sino` se ejecutarán si la condición del `Si` fue falsa.

#### 5. Control (Panel Inferior)
- **Definir Procedimiento:**
  - Escribe un nombre en el campo "NombreDelProcedimiento".
  - Haz clic en el botón `Definir Procedimiento` para guardar la secuencia de comandos actual como un nuevo procedimiento reutilizable. La cola de comandos se limpiará para que puedas empezar un nuevo programa.
- **Ejecutar:** Inicia la ejecución del programa que has construido. Verás el cursor moverse y pintar en el lienzo. El botón se desactiva durante la ejecución.
- **Borrar:** Elimina el último comando o bloque que añadiste a la secuencia.
- **Resetear:** Limpia por completo la secuencia de comandos y el lienzo, devolviendo todo a su estado inicial.
- **Archivos:** Abre una ventana modal para guardar o cargar tu trabajo.

---

### Panel Derecho: Lienzo y Código

Aquí es donde visualizas el resultado de tu programa.

#### Lienzo de Dibujo
- Un lienzo de 7x7 celdas.
- El recuadro azul cian representa el **cursor**, que indica la posición actual.
- Durante la ejecución, verás cómo el cursor se mueve y pinta en el lienzo según las instrucciones de tu programa.

#### Generated Code
- Un editor de texto de solo lectura que muestra el código QDraw correspondiente al programa visual que has creado.
- Se actualiza en tiempo real a medida que añades, eliminas o anidas comandos. Es una excelente forma de aprender la sintaxis del lenguaje QDraw.

---

### Gestión de Archivos (Modal)

Al hacer clic en el botón `Archivos`, se abre una ventana con las siguientes opciones:

- **Guardar Sesión (.json):** Guarda el estado completo de tu trabajo, incluyendo la cola de comandos actual y todos los procedimientos que has definido, en un archivo `.json`. Es perfecto para guardar tu progreso y continuar más tarde.
- **Exportar a Texto (.txt):** Guarda el código QDraw generado y una representación textual del estado final del lienzo en un archivo `.txt`. Ideal para compartir tu creación o para documentación.
- **Cargar Sesión (.json):** Abre un archivo `.json` que hayas guardado previamente para restaurar tu sesión de trabajo, cargando tanto el programa principal como los procedimientos definidos.