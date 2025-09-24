document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const getEl = (id) => document.getElementById(id);

  const proceduresContainer = getEl('procedures-container');
  const proceduresList = getEl('procedures-list');
  const commandsContainer = getEl('commands-container');
  const conditionsList = getEl('conditions-list');
  const repeatCountInput = getEl('repeat-count-input');
  const addRepeatButton = getEl('add-repeat-button');
  const addIfButton = getEl('add-if-button');
  const addElseButton = getEl('add-else-button');
  const procedureNameInput = getEl('procedure-name-input');
  const defineProcedureButton = getEl('define-procedure-button');
  const runButton = getEl('run-button');
  const runButtonText = runButton.querySelector('span');
  const deleteLastCommandButton = getEl('delete-last-command-button');
  const resetButton = getEl('reset-button');
  const fileModalButton = getEl('file-modal-button');
  const canvas = getEl('canvas');
  const errorMessageContainer = getEl('error-message-container');
  const codeEditor = getEl('code-editor');
  const fileModal = getEl('file-modal');
  const closeModalButton = getEl('close-modal-button');
  const saveJsonButton = getEl('save-json-button');
  const exportTxtButton = getEl('export-txt-button');
  const loadJsonButton = getEl('load-json-button');
  const fileInput = getEl('file-input');

  // --- App State ---
  const gridSize = 16;
  let grid = [];
  let cursor = { x: 0, y: 0 };
  let commandQueue = [];
  let isExecuting = false;
  let procedures = new Map();
  let selectedCondition = null;

  // --- Constants ---
  const commandGroups = [
    {
      title: 'Comandos',
      commands: ['PintarNegro', 'PintarRojo', 'PintarVerde', 'Limpiar'],
    },
    {
      title: 'Movimiento',
      commands: ['MoverArriba', 'MoverAbajo', 'MoverIzquierda', 'MoverDerecha'],
    },
  ];
  const primitiveCommands = commandGroups.flatMap(g => g.commands);
  const conditions = [
    'estaVacia?',
    'estaPintadaDeNegro?',
    'estaPintadaDeRojo?',
    'estaPintadaDeVerde?',
  ];
  const colors = {
    black: '#111827', // gray-900
    red: '#ef4444',   // red-500
    green: '#22c55e', // green-500
    error: '#f87171', // red-400
    transparent: 'transparent'
  };

  // --- Core Functions ---

  function findLastOpenBlock(block) {
    if (block.length === 0) return block;
    const lastCommand = block[block.length - 1];
    if (lastCommand.type === 'repetir') return findLastOpenBlock(lastCommand.bloque);
    if (lastCommand.type === 'condicional') {
      if (lastCommand.bloque_sino !== undefined) return findLastOpenBlock(lastCommand.bloque_sino);
      return findLastOpenBlock(lastCommand.bloque_entonces);
    }
    return block;
  }

  function findLastIfWithoutElse(block) {
    if (block.length === 0) return null;
    const lastCommand = block[block.length - 1];

    if (lastCommand.type === 'repetir') return findLastIfWithoutElse(lastCommand.bloque);
    if (lastCommand.type === 'condicional') {
      if (lastCommand.bloque_sino !== undefined) {
        const resultInElse = findLastIfWithoutElse(lastCommand.bloque_sino);
        if (resultInElse) return resultInElse;
      }
      const resultInThen = findLastIfWithoutElse(lastCommand.bloque_entonces);
      if (resultInThen) return resultInThen;
      if (lastCommand.bloque_sino === undefined) return lastCommand;
    }
    return null;
  }

  function deleteLastCommandRecursive(block) {
      if (block.length === 0) return false;
      const lastCommand = block[block.length - 1];

      if (lastCommand.type === 'repetir' && lastCommand.bloque.length > 0) {
          if (deleteLastCommandRecursive(lastCommand.bloque)) return true;
      } else if (lastCommand.type === 'condicional') {
          if (lastCommand.bloque_sino !== undefined) {
              if (deleteLastCommandRecursive(lastCommand.bloque_sino)) return true;
              else {
                  delete lastCommand.bloque_sino;
                  return true;
              }
          }
          if (lastCommand.bloque_entonces.length > 0) {
              if (deleteLastCommandRecursive(lastCommand.bloque_entonces)) return true;
          }
      }
      block.pop();
      return true;
  }

  function generateCodeFromQueue(queue, indentLevel = 0) {
    const indent = '  '.repeat(indentLevel);
    let code = '';
    for (const command of queue) {
        if (command.type === 'primitiva' || command.type === 'procedimiento') {
            code += `${indent}${command.nombre};\n`;
        } else if (command.type === 'repetir') {
            code += `${indent}repetir ${command.veces} veces {\n`;
            code += generateCodeFromQueue(command.bloque, indentLevel + 1);
            code += `${indent}}\n`;
        } else if (command.type === 'condicional') {
            code += `${indent}si (${command.condicion.nombre}) entonces {\n`;
            code += generateCodeFromQueue(command.bloque_entonces, indentLevel + 1);
            if (command.bloque_sino !== undefined) {
                code += `${indent}} sino {\n`;
                code += generateCodeFromQueue(command.bloque_sino, indentLevel + 1);
            }
            code += `${indent}}\n`;
        }
    }
    return code;
  }

  // --- Command & Action Handlers ---

  function addCommandToQueue(commandName) {
    if (isExecuting) return;
    let commandNode;
    if (primitiveCommands.includes(commandName)) {
      commandNode = { type: 'primitiva', nombre: commandName };
    } else if (procedures.has(commandName)) {
      commandNode = { type: 'procedimiento', nombre: commandName };
    } else {
      return;
    }
    const targetBlock = findLastOpenBlock(commandQueue);
    targetBlock.push(commandNode);
    renderAll();
  }

  function addRepeatBlock() {
    if (isExecuting) return;
    const repeatNode = {
      type: 'repetir',
      veces: parseInt(repeatCountInput.value, 10) || 1,
      bloque: [],
    };
    const targetBlock = findLastOpenBlock(commandQueue);
    targetBlock.push(repeatNode);
    renderAll();
  }

  function addIfBlock() {
    if (isExecuting || !selectedCondition) return;
    const ifNode = {
      type: 'condicional',
      condicion: { type: 'sensor', nombre: selectedCondition },
      bloque_entonces: [],
    };
    const targetBlock = findLastOpenBlock(commandQueue);
    targetBlock.push(ifNode);
    selectCondition(null); // Deselect after use
    renderAll();
  }

  function addElseBlock() {
    if (isExecuting || !canAddElse()) return;
    const targetIf = findLastIfWithoutElse(commandQueue);
    if (targetIf) {
      targetIf.bloque_sino = [];
    }
    renderAll();
  }

  function defineNewProcedure() {
    if (isExecuting || isProcedureNameInvalid()) return;
    const name = procedureNameInput.value.trim();
    procedures.set(name, JSON.parse(JSON.stringify(commandQueue)));
    procedureNameInput.value = '';
    resetAll(); // Also clears the queue
    renderAll();
  }

  function deleteLastCommand() {
    if (isExecuting) return;
    deleteLastCommandRecursive(commandQueue);
    renderAll();
  }

  function resetAll() {
    if (isExecuting) return;
    commandQueue = [];
    resetGridAndCursor();
    hideErrorMessage();
    renderAll();
  }

  function resetGridAndCursor() {
    grid = [];
    for (let y = 0; y < gridSize; y++) {
      const row = [];
      for (let x = 0; x < gridSize; x++) {
        row.push({ x, y, color: colors.transparent });
      }
      grid.push(row);
    }
    cursor = { x: 0, y: 0 };
  }

  // --- Execution Logic ---

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function evaluarCondicion(condicion) {
    const cell = grid[cursor.y][cursor.x];
    switch (condicion.nombre) {
        case 'estaVacia?': return cell.color === colors.transparent;
        case 'estaPintadaDeNegro?': return cell.color === colors.black;
        case 'estaPintadaDeRojo?': return cell.color === colors.red;
        case 'estaPintadaDeVerde?': return cell.color === colors.green;
        default: return false;
    }
  }

  async function executeSequence(commands = commandQueue) {
    const isRootCall = commands === commandQueue;
    if (isRootCall) {
      if (isExecuting) return;
      isExecuting = true;
      resetGridAndCursor();
      renderAll();
      await delay(150);
    }

    for (const command of commands) {
      if (!isExecuting) break;
      switch (command.type) {
        case 'primitiva':
          await executePrimitiveCommand(command.nombre);
          break;
        case 'procedimiento':
          const procedureSequence = procedures.get(command.nombre);
          if (procedureSequence) await executeSequence(procedureSequence);
          break;
        case 'repetir':
          for (let i = 0; i < command.veces; i++) {
            if (!isExecuting) break;
            await executeSequence(command.bloque);
          }
          break;
        case 'condicional':
          if (evaluarCondicion(command.condicion)) {
            await executeSequence(command.bloque_entonces);
          } else if (command.bloque_sino) {
            await executeSequence(command.bloque_sino);
          }
          break;
      }
      if (!isExecuting) break;
    }

    if (isRootCall) {
      isExecuting = false;
      renderAll();
    }
  }

  async function executePrimitiveCommand(name) {
    let boundaryError = false;
    const { x, y } = cursor;
    switch (name) {
      case 'MoverDerecha':
        if (x < gridSize - 1) cursor.x++; else boundaryError = true;
        break;
      case 'MoverIzquierda':
        if (x > 0) cursor.x--; else boundaryError = true;
        break;
      case 'MoverAbajo':
        if (y < gridSize - 1) cursor.y++; else boundaryError = true;
        break;
      case 'MoverArriba':
        if (y > 0) cursor.y--; else boundaryError = true;
        break;
      case 'PintarNegro': paintCell(x, y, colors.black); break;
      case 'PintarRojo': paintCell(x, y, colors.red); break;
      case 'PintarVerde': paintCell(x, y, colors.green); break;
      case 'Limpiar': paintCell(x, y, colors.transparent); break;
    }

    renderGrid();
    if (boundaryError) await handleBoundaryError();
    await delay(100);
  }

  function paintCell(x, y, color) {
    if (grid[y] && grid[y][x]) {
      grid[y][x].color = color;
    }
  }

  async function handleBoundaryError() {
    showErrorMessage('Error: Movimiento fuera de límites');
    const { x, y } = cursor;
    const originalColor = grid[y][x].color;
    paintCell(x, y, colors.error);
    renderGrid();
    await delay(300);
    paintCell(x, y, originalColor);
    renderGrid();
  }

  // --- UI Rendering & State Updates ---

  function renderAll() {
    renderGrid();
    renderCodeEditor();
    renderProcedureButtons();
    renderConditionButtons();
    updateButtonStates();
  }

  function renderGrid() {
    canvas.innerHTML = '';
    grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        const cellEl = document.createElement('div');
        cellEl.className = 'cell w-full h-full border-r border-b border-gray-600 transition-all duration-150';
        cellEl.style.backgroundColor = cell.color;
        if (cursor.x === x && cursor.y === y) {
          cellEl.classList.add('cursor');
        }
        canvas.appendChild(cellEl);
      });
    });
  }

  function renderCodeEditor() {
    codeEditor.textContent = generateCodeFromQueue(commandQueue);
  }

  function renderProcedureButtons() {
    proceduresList.innerHTML = '';
    if (procedures.size > 0) {
      proceduresContainer.classList.remove('hidden');
      procedures.forEach((_, name) => {
        const button = document.createElement('button');
        button.textContent = name;
        button.className = 'px-3 py-2 text-sm font-medium text-center text-white bg-purple-600 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-purple-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200';
        button.onclick = () => addCommandToQueue(name);
        proceduresList.appendChild(button);
      });
    } else {
      proceduresContainer.classList.add('hidden');
    }
  }

  function renderCommandButtons() {
    commandsContainer.innerHTML = '';
    commandGroups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.innerHTML = `<h3 class="text-lg font-semibold mb-3 text-gray-300 border-b border-gray-600 pb-1">${group.title}</h3>`;
      const listEl = document.createElement('div');
      listEl.className = 'grid grid-cols-1 gap-2';
      group.commands.forEach(command => {
        const button = document.createElement('button');
        button.textContent = command;
        button.className = "px-3 py-2 text-sm font-medium text-center text-white bg-gray-700 rounded-md hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-gray-600 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200";
        button.onclick = () => addCommandToQueue(command);
        listEl.appendChild(button);
      });
      groupEl.appendChild(listEl);
      commandsContainer.appendChild(groupEl);
    });
  }

  function renderConditionButtons() {
    conditionsList.innerHTML = '';
    conditions.forEach(condition => {
      const button = document.createElement('button');
      button.textContent = condition;
      const isSelected = selectedCondition === condition;
      button.className = `px-3 py-2 text-sm font-medium text-center text-white rounded-md hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-gray-600 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200 ${isSelected ? 'bg-cyan-600' : 'bg-gray-700'}`;
      button.onclick = () => selectCondition(condition);
      conditionsList.appendChild(button);
    });
  }

  function selectCondition(conditionName) {
    if (isExecuting) return;
    selectedCondition = selectedCondition === conditionName ? null : conditionName;
    renderAll();
  }

  function canAddElse() {
    return findLastIfWithoutElse(commandQueue) !== null;
  }

  function isProcedureNameInvalid() {
    const name = procedureNameInput.value.trim();
    return !name || procedures.has(name) || primitiveCommands.includes(name);
  }

  function updateButtonStates() {
    // Execution state
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(b => b.disabled = isExecuting);
    [procedureNameInput, repeatCountInput].forEach(i => i.disabled = isExecuting);

    if (isExecuting) {
      runButtonText.textContent = "Executing...";
      runButton.disabled = true; // Keep it disabled
    } else {
      runButtonText.textContent = "Ejecutar";
      // Specific logic for non-execution state
      runButton.disabled = commandQueue.length === 0;
      deleteLastCommandButton.disabled = commandQueue.length === 0;
      defineProcedureButton.disabled = commandQueue.length === 0 || isProcedureNameInvalid();
      addIfButton.disabled = !selectedCondition;
      addElseButton.disabled = !canAddElse();
      // Re-enable all buttons
      allButtons.forEach(b => b.disabled = false);
      [procedureNameInput, repeatCountInput].forEach(i => i.disabled = false);
      // Then re-apply specific disabled states
      runButton.disabled = commandQueue.length === 0;
      deleteLastCommandButton.disabled = commandQueue.length === 0;
      defineProcedureButton.disabled = commandQueue.length === 0 || isProcedureNameInvalid();
      addIfButton.disabled = !selectedCondition;
      addElseButton.disabled = !canAddElse();
    }
  }

  function showErrorMessage(message, duration = 2000) {
    errorMessageContainer.textContent = message;
    errorMessageContainer.classList.remove('hidden');
    setTimeout(() => {
      if (errorMessageContainer.textContent === message) {
        hideErrorMessage();
      }
    }, duration);
  }

  function hideErrorMessage() {
    errorMessageContainer.classList.add('hidden');
    errorMessageContainer.textContent = '';
  }

  // --- File I/O ---

  function toggleModal(isOpen) {
    fileModal.classList.toggle('hidden', !isOpen);
  }

  function saveToFile() {
    const programState = {
      commandQueue: commandQueue,
      procedures: Object.fromEntries(procedures),
    };
    const data = JSON.stringify(programState, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qdraw-session.json';
    a.click();
    window.URL.revokeObjectURL(url);
    toggleModal(false);
  }

  function exportToTxt() {
    const programCode = `programa {\n${generateCodeFromQueue(commandQueue, 1)}\n}\n\n`;
    let proceduresCode = '';
    procedures.forEach((body, name) => {
        proceduresCode += `procedimiento ${name} {\n${generateCodeFromQueue(body, 1)}\n}\n\n`;
    });
    const fullContent = (programCode + proceduresCode).trim();
    const blob = new Blob([fullContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qdraw-export.txt';
    a.click();
    window.URL.revokeObjectURL(url);
    toggleModal(false);
  }

  function loadFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const state = JSON.parse(e.target.result);
        if (!state || typeof state.procedures !== 'object' || !Array.isArray(state.commandQueue)) {
          throw new Error('Formato de archivo inválido.');
        }
        resetAll();
        procedures = new Map(Object.entries(state.procedures));
        commandQueue = state.commandQueue;
        renderAll();
        toggleModal(false);
      } catch (error) {
        showErrorMessage('Error: Archivo corrupto o con formato inválido.');
        toggleModal(false);
      }
    };
    reader.onerror = () => showErrorMessage('Error al leer el archivo.');
    reader.readAsText(file);
    fileInput.value = '';
  }

  // --- Event Listeners ---
  function addEventListeners() {
    addRepeatButton.onclick = addRepeatBlock;
    addIfButton.onclick = addIfBlock;
    addElseButton.onclick = addElseBlock;
    defineProcedureButton.onclick = defineNewProcedure;
    runButton.onclick = () => executeSequence();
    deleteLastCommandButton.onclick = deleteLastCommand;
    resetButton.onclick = resetAll;
    fileModalButton.onclick = () => toggleModal(true);
    closeModalButton.onclick = () => toggleModal(false);
    saveJsonButton.onclick = saveToFile;
    exportTxtButton.onclick = exportToTxt;
    loadJsonButton.onclick = () => fileInput.click();
    fileInput.onchange = loadFile;
    procedureNameInput.addEventListener('input', renderAll);
  }

  // --- Initialization ---
  function init() {
    resetGridAndCursor();
    renderCommandButtons();
    renderConditionButtons();
    addEventListeners();
    renderAll();
  }

  init();
});