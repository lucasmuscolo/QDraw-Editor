import { Component, ChangeDetectionStrategy, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Cell {
  x: number;
  y: number;
  color: string;
}

// Define the structure for different types of commands
interface PrimitiveCommand {
  type: 'primitiva';
  nombre: string;
}

interface ProcedureCommand {
  type: 'procedimiento';
  nombre: string;
}

interface RepeatCommand {
  type: 'repetir';
  veces: number;
  bloque: CommandNode[];
}

interface SensorCondition {
  type: 'sensor';
  nombre: string;
}

interface ConditionalCommand {
  type: 'condicional';
  condicion: SensorCondition;
  bloque_entonces: CommandNode[];
  bloque_sino?: CommandNode[];
}

type CommandNode = PrimitiveCommand | ProcedureCommand | RepeatCommand | ConditionalCommand;

interface ProgramState {
  commandQueue: CommandNode[];
  procedures: Record<string, CommandNode[]>;
}


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule],
})
export class AppComponent implements OnInit {
  readonly gridSize = 16;
  
  grid = signal<Cell[][]>([]);
  cursor = signal({ x: 0, y: 0 });
  commandQueue = signal<CommandNode[]>([]);
  isExecuting = signal(false);
  codeContent = signal('');
  errorMessage = signal('');

  // Procedure-related signals
  procedureName = signal('');
  procedures = signal<Map<string, CommandNode[]>>(new Map());
  procedureNames = computed(() => Array.from(this.procedures().keys()));

  // Loop-related signal
  repeatCount = signal(3);

  // Condition-related signals
  selectedCondition = signal<string | null>(null);
  readonly conditions = [
    'estaVacia?',
    'estaPintadaDeNegro?',
    'estaPintadaDeRojo?',
    'estaPintadaDeVerde?',
  ];

  // Modal state
  isModalOpen = signal(false);

  commandGroups = [
    {
      title: 'Comandos',
      commands: ['PintarNegro', 'PintarRojo', 'PintarVerde', 'Limpiar'],
    },
    {
      title: 'Movimiento',
      commands: ['MoverArriba', 'MoverAbajo', 'MoverIzquierda', 'MoverDerecha'],
    },
  ];

  primitiveCommands = computed(() => this.commandGroups.flatMap(g => g.commands));

  isProcedureNameInvalid = computed(() => {
    const name = this.procedureName().trim();
    if (!name) return true; // Invalid if empty
    if (this.procedures().has(name)) return true; // Invalid if already exists
    if (this.primitiveCommands().includes(name)) return true; // Invalid if it's a primitive command name
    return false;
  });

  canAddElse = computed(() => {
    return this.findLastIfWithoutElse(this.commandQueue()) !== null;
  });

  ngOnInit() {
    this.resetGridAndCursor();
  }
  
  onProcedureNameChange(event: Event) {
    this.procedureName.set((event.target as HTMLInputElement).value);
  }

  onRepeatCountChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value > 0) {
      this.repeatCount.set(value);
    } else {
      this.repeatCount.set(1);
    }
  }

  private findLastOpenBlock(block: CommandNode[]): CommandNode[] {
    if (block.length === 0) {
      return block;
    }
    const lastCommand = block[block.length - 1];
    if (lastCommand.type === 'repetir') {
      return this.findLastOpenBlock(lastCommand.bloque);
    } else if (lastCommand.type === 'condicional') {
      // If an else block exists, it's the most recent open block
      if (lastCommand.bloque_sino !== undefined) {
          return this.findLastOpenBlock(lastCommand.bloque_sino);
      }
      // Otherwise, it's the 'then' block
      return this.findLastOpenBlock(lastCommand.bloque_entonces);
    }
    return block;
  }

  addCommandToQueue(commandName: string): void {
    if (this.isExecuting()) return;
    
    let commandNode: PrimitiveCommand | ProcedureCommand;
    if (this.primitiveCommands().includes(commandName)) {
      commandNode = { type: 'primitiva', nombre: commandName };
    } else if (this.procedures().has(commandName)) {
      commandNode = { type: 'procedimiento', nombre: commandName };
    } else {
      return; 
    }

    this.commandQueue.update(queue => {
      const newQueue = JSON.parse(JSON.stringify(queue));
      const targetBlock = this.findLastOpenBlock(newQueue);
      targetBlock.push(commandNode);
      return newQueue;
    });

    this.updateCodeEditor();
  }

  addRepeatBlock(): void {
    if (this.isExecuting()) return;

    const repeatNode: RepeatCommand = {
      type: 'repetir',
      veces: this.repeatCount(),
      bloque: [],
    };

    this.commandQueue.update(queue => {
      const newQueue = JSON.parse(JSON.stringify(queue));
      const targetBlock = this.findLastOpenBlock(newQueue);
      targetBlock.push(repeatNode);
      return newQueue;
    });

    this.updateCodeEditor();
  }

  selectCondition(conditionName: string): void {
    if (this.isExecuting()) return;
    this.selectedCondition.update(current => current === conditionName ? null : conditionName);
  }

  addIfBlock(): void {
    if (this.isExecuting() || !this.selectedCondition()) return;

    const ifNode: ConditionalCommand = {
      type: 'condicional',
      condicion: { type: 'sensor', nombre: this.selectedCondition()! },
      bloque_entonces: [],
    };

    this.commandQueue.update(queue => {
      const newQueue = JSON.parse(JSON.stringify(queue));
      const targetBlock = this.findLastOpenBlock(newQueue);
      targetBlock.push(ifNode);
      return newQueue;
    });
    
    this.selectedCondition.set(null);
    this.updateCodeEditor();
  }

  addElseBlock(): void {
    if (this.isExecuting() || !this.canAddElse()) return;
    
    this.commandQueue.update(queue => {
        const newQueue = JSON.parse(JSON.stringify(queue));
        const targetIf = this.findLastIfWithoutElse(newQueue);
        if (targetIf) {
            targetIf.bloque_sino = [];
        }
        return newQueue;
    });

    this.updateCodeEditor();
  }

  private findLastIfWithoutElse(block: CommandNode[]): ConditionalCommand | null {
    if (block.length === 0) {
        return null;
    }
    const lastCommand = block[block.length - 1];

    if (lastCommand.type === 'repetir') {
        return this.findLastIfWithoutElse(lastCommand.bloque);
    } else if (lastCommand.type === 'condicional') {
        // If an else block exists, we need to search inside it for a nested if
        if (lastCommand.bloque_sino !== undefined) {
             const resultInElse = this.findLastIfWithoutElse(lastCommand.bloque_sino);
             if (resultInElse) return resultInElse;
        }
        // Then search inside the 'then' block
        const resultInThen = this.findLastIfWithoutElse(lastCommand.bloque_entonces);
        if (resultInThen) return resultInThen;

        // If no nested 'if' is found and this 'if' doesn't have an 'else', this is our target.
        if (lastCommand.bloque_sino === undefined) {
            return lastCommand;
        }
    }
    return null;
  }

  defineNewProcedure(): void {
    if (this.isExecuting() || this.isProcedureNameInvalid() || this.commandQueue().length === 0) {
        return;
    }
    const name = this.procedureName().trim();
    const commandsCopy = JSON.parse(JSON.stringify(this.commandQueue()));

    this.procedures.update(procs => {
        const newProcs = new Map(procs);
        newProcs.set(name, commandsCopy);
        return newProcs;
    });

    this.procedureName.set('');
    this.resetAll();
  }

  private deleteLastCommandRecursive(block: CommandNode[]): boolean {
    if (block.length === 0) {
        return false;
    }
    const lastCommand = block[block.length - 1];
    
    if (lastCommand.type === 'repetir' && lastCommand.bloque.length > 0) {
        const deleted = this.deleteLastCommandRecursive(lastCommand.bloque);
        if (deleted) return true;
    } else if (lastCommand.type === 'condicional') {
        // If else block exists, try deleting from it first
        if (lastCommand.bloque_sino !== undefined) {
            const deleted = this.deleteLastCommandRecursive(lastCommand.bloque_sino);
            if (deleted) return true;
            // If the else block is now empty, remove it to "undo" adding it
            else {
                delete lastCommand.bloque_sino;
                return true;
            }
        }
        // if no else block, or it was just removed, try deleting from 'then'
        if (lastCommand.bloque_entonces.length > 0) {
            const deleted = this.deleteLastCommandRecursive(lastCommand.bloque_entonces);
            if (deleted) return true;
        }
    }

    block.pop();
    return true;
  }

  deleteLastCommand(): void {
    if (this.isExecuting()) return;
    this.commandQueue.update(queue => {
        const newQueue = JSON.parse(JSON.stringify(queue));
        this.deleteLastCommandRecursive(newQueue);
        return newQueue;
    });
    this.updateCodeEditor();
  }

  resetAll(): void {
    if (this.isExecuting()) return;
    this.commandQueue.set([]);
    this.resetGridAndCursor();
    this.updateCodeEditor();
    this.errorMessage.set('');
    this.procedureName.set('');
  }

  private updateCodeEditor(): void {
    this.codeContent.set(this.generateCodeFromQueue(this.commandQueue()));
  }

  private generateCodeFromQueue(queue: CommandNode[], indentLevel = 0): string {
    const indent = '  '.repeat(indentLevel);
    let code = '';
    for (const command of queue) {
        if (command.type === 'primitiva' || command.type === 'procedimiento') {
            code += `${indent}${command.nombre};\n`;
        } else if (command.type === 'repetir') {
            code += `${indent}repetir ${command.veces} veces {\n`;
            code += this.generateCodeFromQueue(command.bloque, indentLevel + 1);
            code += `${indent}}\n`;
        } else if (command.type === 'condicional') {
            code += `${indent}si (${command.condicion.nombre}) entonces {\n`;
            code += this.generateCodeFromQueue(command.bloque_entonces, indentLevel + 1);
            if (command.bloque_sino !== undefined) {
                code += `${indent}} sino {\n`;
                code += this.generateCodeFromQueue(command.bloque_sino, indentLevel + 1);
            }
            code += `${indent}}\n`;
        }
    }
    return code;
  }

  resetGridAndCursor(): void {
    const newGrid: Cell[][] = [];
    for (let y = 0; y < this.gridSize; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < this.gridSize; x++) {
        row.push({ x, y, color: 'transparent' });
      }
      newGrid.push(row);
    }
    this.grid.set(newGrid);
    this.cursor.set({ x: 0, y: 0 });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private evaluarCondicion(condicion: SensorCondition): boolean {
    const { x, y } = this.cursor();
    const cell = this.grid()[y][x];

    switch (condicion.nombre) {
        case 'estaVacia?':
            return cell.color === 'transparent';
        case 'estaPintadaDeNegro?':
            return cell.color === '#111827'; // gray-900
        case 'estaPintadaDeRojo?':
            return cell.color === '#ef4444'; // red-500
        case 'estaPintadaDeVerde?':
            return cell.color === '#22c55e'; // green-500
        default:
            return false;
    }
  }

  async executeSequence(commands: CommandNode[] = this.commandQueue()): Promise<void> {
    const isRootCall = commands === this.commandQueue();

    if (isRootCall) {
      if (this.isExecuting()) return;
      this.isExecuting.set(true);
      this.resetGridAndCursor();
      await this.delay(150);
    }
    
    for (const command of commands) {
      if (!this.isExecuting()) break;

      switch (command.type) {
        case 'primitiva':
          await this.executePrimitiveCommand(command.nombre);
          break;
        case 'procedimiento':
          const procedureSequence = this.procedures().get(command.nombre);
          if (procedureSequence) {
            await this.executeSequence(procedureSequence);
          }
          break;
        case 'repetir':
          for (let i = 0; i < command.veces; i++) {
            if (!this.isExecuting()) break;
            await this.executeSequence(command.bloque);
          }
          break;
        case 'condicional':
          const conditionMet = this.evaluarCondicion(command.condicion);
          if (conditionMet) {
            if (!this.isExecuting()) break;
            await this.executeSequence(command.bloque_entonces);
          } else if (command.bloque_sino) {
            if (!this.isExecuting()) break;
            await this.executeSequence(command.bloque_sino);
          }
          break;
      }
    }

    if (isRootCall) {
      this.isExecuting.set(false);
    }
  }

  private async executePrimitiveCommand(name: string): Promise<void> {
    const cursor = this.cursor();
    switch (name) {
      case 'MoverDerecha':
        if (cursor.x < this.gridSize - 1) {
          this.cursor.set({ ...cursor, x: cursor.x + 1 });
        } else {
          await this.handleBoundaryError();
        }
        break;
      case 'MoverIzquierda':
        if (cursor.x > 0) {
          this.cursor.set({ ...cursor, x: cursor.x - 1 });
        } else {
          await this.handleBoundaryError();
        }
        break;
      case 'MoverAbajo':
        if (cursor.y < this.gridSize - 1) {
          this.cursor.set({ ...cursor, y: cursor.y + 1 });
        } else {
          await this.handleBoundaryError();
        }
        break;
      case 'MoverArriba':
        if (cursor.y > 0) {
          this.cursor.set({ ...cursor, y: cursor.y - 1 });
        } else {
          await this.handleBoundaryError();
        }
        break;
      case 'PintarNegro':
        this.paintCell(cursor.x, cursor.y, '#111827'); // gray-900
        break;
      case 'PintarRojo':
        this.paintCell(cursor.x, cursor.y, '#ef4444'); // red-500
        break;
      case 'PintarVerde':
        this.paintCell(cursor.x, cursor.y, '#22c55e'); // green-500
        break;
      case 'Limpiar':
        this.paintCell(cursor.x, cursor.y, 'transparent');
        break;
    }
    await this.delay(100);
  }

  private async handleBoundaryError(): Promise<void> {
    this.showErrorMessage('Error: Movimiento fuera de límites');
    const { x, y } = this.cursor();
    const originalColor = this.grid()[y][x].color;
    this.paintCell(x, y, '#f87171'); // red-400
    await this.delay(300);
    this.paintCell(x, y, originalColor);
  }

  private showErrorMessage(message: string, duration: number = 2000): void {
    this.errorMessage.set(message);
    setTimeout(() => {
      if (this.errorMessage() === message) {
        this.errorMessage.set('');
      }
    }, duration);
  }

  private paintCell(x: number, y: number, color: string): void {
    this.grid.update(currentGrid => {
      const newGrid = currentGrid.map(row => [...row]);
      if (newGrid[y] && newGrid[y][x]) {
        newGrid[y][x] = { ...newGrid[y][x], color: color };
      }
      return newGrid;
    });
  }

  isCursorAt(x: number, y: number): boolean {
    const c = this.cursor();
    return c.x === x && c.y === y;
  }

  // --- File Modal and I/O Logic ---

  toggleModal(isOpen: boolean): void {
    this.isModalOpen.set(isOpen);
  }

  saveToFile(): void {
    const programState: ProgramState = {
      commandQueue: this.commandQueue(),
      procedures: Object.fromEntries(this.procedures()),
    };
    
    const data = JSON.stringify(programState, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qdraw-session.json';
    a.click();
    
    window.URL.revokeObjectURL(url);
    this.toggleModal(false);
  }

  exportToTxt(): void {
    const programCode = this.generateProgramString();
    const gridState = this.generateGridString();
    const fullContent = `${programCode}\n\n${gridState}`;

    const blob = new Blob([fullContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qdraw-export.txt';
    a.click();
    
    window.URL.revokeObjectURL(url);
    this.toggleModal(false);
  }

  private generateProgramString(): string {
    let programCode = 'programa {\n';
    programCode += this.generateCodeFromQueue(this.commandQueue(), 1);
    programCode += '}\n\n';

    this.procedures().forEach((body, name) => {
        programCode += `procedimiento ${name} {\n`;
        programCode += this.generateCodeFromQueue(body, 1);
        programCode += '}\n\n';
    });

    return programCode.trim();
  }

  private generateGridString(): string {
    let gridStr = '--- ESTADO DE LA GRILLA ---\n';
    const grid = this.grid();
    const cursor = this.cursor();

    for (let y = 0; y < grid.length; y++) {
        let rowStr = '';
        for (let x = 0; x < grid[y].length; x++) {
            const cell = grid[y][x];
            let char = '.';
            switch (cell.color) {
                case '#111827': char = 'N'; break; // Negro
                case '#ef4444': char = 'R'; break; // Rojo
                case '#22c55e': char = 'V'; break; // Verde
            }
            if (cursor.x === x && cursor.y === y) {
                rowStr += `[${char}]`;
            } else {
                rowStr += ` ${char} `;
            }
        }
        gridStr += rowStr + '\n';
    }
    return gridStr;
  }

  loadFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      this.parseAndLoadProgram(content);
    };
    
    reader.onerror = () => {
      this.showErrorMessage('Error al leer el archivo.');
      this.toggleModal(false);
    };
    
    reader.readAsText(file);
    input.value = ''; // Reset input for same-file re-upload
  }

  private parseAndLoadProgram(content: string): void {
    try {
      const state: ProgramState = JSON.parse(content);
      
      // Basic validation
      if (!state || typeof state.procedures !== 'object' || !Array.isArray(state.commandQueue)) {
        throw new Error('Formato de archivo inválido.');
      }
      
      this.resetAll();

      const newProcedures = new Map(Object.entries(state.procedures));
      this.procedures.set(newProcedures);
      this.commandQueue.set(state.commandQueue);
      
      this.updateCodeEditor();
      this.toggleModal(false);
      
    } catch (error) {
      this.showErrorMessage('Error: Archivo corrupto o con formato inválido.');
      this.toggleModal(false);
    }
  }
}