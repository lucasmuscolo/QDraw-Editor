document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let state = {
        gridWidth: 7,
        gridHeight: 7,
        newGridWidth: 7,
        newGridHeight: 7,
        grid: [],
        cursor: { x: 0, y: 0 }, // (0,0) is bottom-left
        commandQueue: [],
        isExecuting: false,
        codeContent: '',
        errorMessage: '',
        procedureName: '',
        procedures: new Map(),
        repeatCount: 3,
        selectedCondition: null,
        isModalOpen: false,
        isExportPreviewModalOpen: false,
        exportPreviewContent: '',
    };

    // --- CONSTANTS ---
    const commandGroups = [
        { title: 'Comandos', commands: ['PintarNegro', 'PintarRojo', 'PintarVerde', 'Limpiar'] },
        { title: 'Movimiento', commands: ['MoverArriba', 'MoverAbajo', 'MoverIzquierda', 'MoverDerecha'] },
    ];
    const primitiveCommands = commandGroups.flatMap(g => g.commands);
    const conditions = ['estaVacia?', 'estaPintadaDeNegro?', 'estaPintadaDeRojo?', 'estaPintadaDeVerde?'];
    const colors = {
        black: '#111827', // gray-900
        red: '#ef4444',   // red-500
        green: '#22c55e', // green-500
        error: '#f87171', // red-400
        transparent: 'transparent'
    };

    // --- DOM ELEMENT REFERENCES ---
    const dom = {
        // Containers
        proceduresSection: document.getElementById('procedures-section'),
        proceduresContainer: document.getElementById('procedures-container'),
        commandsContainer: document.getElementById('commands-container'),
        movementContainer: document.getElementById('movement-container'),
        conditionsContainer: document.getElementById('conditions-container'),
        canvasContainer: document.getElementById('canvas-container'),
        gridControlsContainer: document.getElementById('grid-controls-container'),
        errorMessageContainer: document.getElementById('error-message-container'),
        codeEditor: document.getElementById('code-editor'),
        runButtonText: document.getElementById('run-button-text'),

        // Inputs
        repeatCountInput: document.getElementById('repeat-count-input'),
        procedureNameInput: document.getElementById('procedure-name-input'),
        gridWidthInput: document.getElementById('grid-width-input'),
        gridHeightInput: document.getElementById('grid-height-input'),
        fileInput: document.getElementById('file-input'),
        exportPreviewTextarea: document.getElementById('export-preview-textarea'),

        // Buttons
        addRepeatButton: document.getElementById('add-repeat-button'),
        addIfButton: document.getElementById('add-if-button'),
        addElseButton: document.getElementById('add-else-button'),
        closeBlockButton: document.getElementById('close-block-button'),
        defineProcedureButton: document.getElementById('define-procedure-button'),
        runButton: document.getElementById('run-button'),
        deleteLastCommandButton: document.getElementById('delete-last-command-button'),
        resetButton: document.getElementById('reset-button'),
        fileModalButton: document.getElementById('file-modal-button'),
        applyGridSizeButton: document.getElementById('apply-grid-size-button'),
        closeFileModalButton: document.getElementById('close-file-modal-button'),
        saveSessionButton: document.getElementById('save-session-button'),
        exportTxtButton: document.getElementById('export-txt-button'),
        loadSessionButton: document.getElementById('load-session-button'),
        cancelExportPreviewButton: document.getElementById('cancel-export-preview-button'),
        savePreviewedTxtButton: document.getElementById('save-previewed-txt-button'),

        // Modals
        fileModal: document.getElementById('file-modal'),
        exportPreviewModal: document.getElementById('export-preview-modal'),
    };

    // --- UTILITY & HELPER FUNCTIONS ---
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

    // --- STATE VALIDATION & COMPUTED-LIKE LOGIC ---
    const isProcedureNameInvalid = () => {
        const name = state.procedureName.trim();
        return !name || state.procedures.has(name) || primitiveCommands.includes(name);
    };

    const findLastOpenBlock = (block) => {
        if (block.length === 0) return block;
        const last = block[block.length - 1];
        if (last.type === 'repetir' && !last.isClosedForEditing) return findLastOpenBlock(last.bloque);
        if (last.type === 'condicional') {
            if (last.bloque_sino !== undefined && !last.isElseClosedForEditing) return findLastOpenBlock(last.bloque_sino);
            if (last.bloque_sino === undefined && !last.isThenClosedForEditing) return findLastOpenBlock(last.bloque_entonces);
        }
        return block;
    };

    const findLastIfWithoutElse = (block) => {
        if (block.length === 0) return null;
        const last = block[block.length - 1];
        if (last.type === 'repetir') return findLastIfWithoutElse(last.bloque);
        if (last.type === 'condicional') {
            if (last.bloque_sino !== undefined) {
                const result = findLastIfWithoutElse(last.bloque_sino);
                if (result) return result;
            }
            const resultInThen = findLastIfWithoutElse(last.bloque_entonces);
            if (resultInThen) return resultInThen;
            if (last.bloque_sino === undefined) return last;
        }
        return null;
    };

    const findAndCloseDeepestBlock = (block) => {
        if (block.length === 0) return false;
        const last = block[block.length - 1];
        if (last.type === 'repetir' && !last.isClosedForEditing) {
            if (findAndCloseDeepestBlock(last.bloque)) return true;
            last.isClosedForEditing = true;
            return true;
        } else if (last.type === 'condicional') {
            if (last.bloque_sino !== undefined && !last.isElseClosedForEditing) {
                if (findAndCloseDeepestBlock(last.bloque_sino)) return true;
                last.isElseClosedForEditing = true;
                return true;
            }
            if (last.bloque_sino === undefined && !last.isThenClosedForEditing) {
                if (findAndCloseDeepestBlock(last.bloque_entonces)) return true;
                last.isThenClosedForEditing = true;
                return true;
            }
        }
        return false;
    };

    const canAddElse = () => findLastIfWithoutElse(state.commandQueue) !== null;
    const canCloseBlock = () => findLastOpenBlock(state.commandQueue) !== state.commandQueue;

    // --- RENDERING / UI UPDATE FUNCTIONS ---
    const render = () => {
        renderGrid();
        renderCommandButtons();
        renderConditionButtons();
        renderProcedureButtons();
        updateCodeEditor();
        updateButtonStates();
        updateModals();
    };

    const renderGrid = () => {
        dom.canvasContainer.innerHTML = '';
        dom.canvasContainer.style.display = 'grid';
        dom.canvasContainer.style.gridTemplateColumns = `repeat(${state.gridWidth}, 1fr)`;
        dom.canvasContainer.style.width = `${state.gridWidth * 30}px`;
        dom.canvasContainer.style.height = `${state.gridHeight * 30}px`;

        const visualCursorY = state.gridHeight - 1 - state.cursor.y;

        for (let y = 0; y < state.gridHeight; y++) {
            for (let x = 0; x < state.gridWidth; x++) {
                const cellData = state.grid[y]?.[x];
                const cellDiv = document.createElement('div');
                cellDiv.className = 'w-full h-full border-r border-b border-gray-600 transition-all duration-150';
                if (cellData) {
                    cellDiv.style.backgroundColor = cellData.color;
                }
                if (state.cursor.x === x && visualCursorY === y) {
                    cellDiv.classList.add('cursor');
                }
                dom.canvasContainer.appendChild(cellDiv);
            }
        }
    };

    const createButton = (text, onClick, container) => {
        const button = document.createElement('button');
        button.textContent = text;
        button.onclick = () => onClick(text);
        container.appendChild(button);
        return button;
    };

    const renderCommandButtons = () => {
        dom.commandsContainer.innerHTML = '';
        dom.movementContainer.innerHTML = '';
        commandGroups[0].commands.forEach(cmd => {
            const btn = createButton(cmd, handleAddCommand, dom.commandsContainer);
            btn.className = 'px-3 py-2 text-sm font-medium text-center text-white bg-gray-700 rounded-md hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-gray-600 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200';
        });
        commandGroups[1].commands.forEach(cmd => {
            const btn = createButton(cmd, handleAddCommand, dom.movementContainer);
            btn.className = 'px-3 py-2 text-sm font-medium text-center text-white bg-gray-700 rounded-md hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-gray-600 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200';
        });
    };

    const renderConditionButtons = () => {
        dom.conditionsContainer.innerHTML = '';
        conditions.forEach(cond => {
            const btn = createButton(cond, handleSelectCondition, dom.conditionsContainer);
            btn.className = 'px-3 py-2 text-sm font-medium text-center text-white rounded-md hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:bg-gray-600 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200';
            btn.classList.toggle('bg-cyan-600', state.selectedCondition === cond);
            btn.classList.toggle('bg-gray-700', state.selectedCondition !== cond);
        });
    };

    const renderProcedureButtons = () => {
        const procedureNames = Array.from(state.procedures.keys());
        if (procedureNames.length > 0) {
            dom.proceduresSection.classList.remove('hidden');
            dom.proceduresContainer.innerHTML = '';
            procedureNames.forEach(name => {
                const btn = createButton(name, handleAddCommand, dom.proceduresContainer);
                btn.className = 'px-3 py-2 text-sm font-medium text-center text-white bg-purple-600 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-purple-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200';
            });
        } else {
            dom.proceduresSection.classList.add('hidden');
        }
    };

    const updateButtonStates = () => {
        const isExecuting = state.isExecuting;
        const queueEmpty = state.commandQueue.length === 0;

        // Disable all command-adding buttons if executing
        document.querySelectorAll('#commands-container button, #movement-container button, #procedures-container button, #conditions-container button').forEach(b => b.disabled = isExecuting);

        // Structure buttons
        dom.addRepeatButton.disabled = isExecuting;
        dom.addIfButton.disabled = isExecuting || !state.selectedCondition;
        dom.addElseButton.disabled = isExecuting || !canAddElse();
        dom.closeBlockButton.disabled = isExecuting || !canCloseBlock();

        // Control buttons
        dom.defineProcedureButton.disabled = isExecuting || queueEmpty || isProcedureNameInvalid();
        dom.runButton.disabled = isExecuting || queueEmpty;
        dom.runButtonText.textContent = isExecuting ? 'Executing...' : 'Ejecutar';
        dom.deleteLastCommandButton.disabled = isExecuting || queueEmpty;
        dom.resetButton.disabled = isExecuting;
        dom.fileModalButton.disabled = isExecuting;

        // Grid controls
        dom.gridWidthInput.disabled = isExecuting;
        dom.gridHeightInput.disabled = isExecuting;
        dom.applyGridSizeButton.disabled = isExecuting;

        // Procedure input
        dom.procedureNameInput.disabled = isExecuting;
    };

    const updateCodeEditor = () => {
        state.codeContent = generateCodeFromQueue(state.commandQueue);
        dom.codeEditor.textContent = state.codeContent;
    };

    const updateModals = () => {
        dom.fileModal.classList.toggle('hidden', !state.isModalOpen);
        dom.exportPreviewModal.classList.toggle('hidden', !state.isExportPreviewModalOpen);
    };

    const showErrorMessage = (message, duration = 2000) => {
        state.errorMessage = message;
        dom.errorMessageContainer.textContent = message;
        dom.errorMessageContainer.classList.remove('hidden');
        setTimeout(() => {
            if (state.errorMessage === message) {
                dom.errorMessageContainer.classList.add('hidden');
                state.errorMessage = '';
            }
        }, duration);
    };

    // --- CORE LOGIC FUNCTIONS ---

    const resetGridAndCursor = () => {
        state.grid = [];
        for (let y = 0; y < state.gridHeight; y++) {
            const row = [];
            for (let x = 0; x < state.gridWidth; x++) {
                row.push({ x, y, color: colors.transparent });
            }
            state.grid.push(row);
        }
        state.cursor = { x: 0, y: 0 };
        renderGrid();
    };

    const resetAll = () => {
        if (state.isExecuting) return;
        state.commandQueue = [];
        state.errorMessage = '';
        state.procedureName = '';
        dom.procedureNameInput.value = '';
        resetGridAndCursor();
        render();
    };

    const handleAddCommand = (commandName) => {
        if (state.isExecuting) return;
        let commandNode;
        if (primitiveCommands.includes(commandName)) {
            commandNode = { type: 'primitiva', nombre: commandName };
        } else if (state.procedures.has(commandName)) {
            commandNode = { type: 'procedimiento', nombre: commandName };
        } else return;

        const targetBlock = findLastOpenBlock(state.commandQueue);
        targetBlock.push(commandNode);
        render();
    };

    const handleAddRepeat = () => {
        if (state.isExecuting) return;
        const repeatNode = { type: 'repetir', veces: state.repeatCount ?? 1, bloque: [] };
        const targetBlock = findLastOpenBlock(state.commandQueue);
        targetBlock.push(repeatNode);
        render();
    };

    const handleAddIf = () => {
        if (state.isExecuting || !state.selectedCondition) return;
        const ifNode = { type: 'condicional', condicion: { type: 'sensor', nombre: state.selectedCondition }, bloque_entonces: [] };
        const targetBlock = findLastOpenBlock(state.commandQueue);
        targetBlock.push(ifNode);
        state.selectedCondition = null;
        render();
    };

    const handleAddElse = () => {
        if (state.isExecuting || !canAddElse()) return;
        const targetIf = findLastIfWithoutElse(state.commandQueue);
        if (targetIf) {
            targetIf.bloque_sino = [];
        }
        render();
    };

    const handleCloseBlock = () => {
        if (state.isExecuting || !canCloseBlock()) return;
        findAndCloseDeepestBlock(state.commandQueue);
        render();
    };

    const handleSelectCondition = (conditionName) => {
        if (state.isExecuting) return;
        state.selectedCondition = state.selectedCondition === conditionName ? null : conditionName;
        render();
    };

    const openAllBlocks = (block) => {
        block.forEach(node => {
            if (node.type === 'repetir') {
                node.isClosedForEditing = false;
                openAllBlocks(node.bloque);
            } else if (node.type === 'condicional') {
                node.isThenClosedForEditing = false;
                node.isElseClosedForEditing = false;
                openAllBlocks(node.bloque_entonces);
                if (node.bloque_sino) openAllBlocks(node.bloque_sino);
            }
        });
    };

    const deleteLastCommandRecursive = (block) => {
        if (block.length === 0) return false;
        const last = block[block.length - 1];
        if (last.type === 'repetir' && last.bloque.length > 0) {
            if (deleteLastCommandRecursive(last.bloque)) return true;
        } else if (last.type === 'condicional') {
            if (last.bloque_sino !== undefined) {
                if (deleteLastCommandRecursive(last.bloque_sino)) return true;
                delete last.bloque_sino;
                delete last.isElseClosedForEditing;
                return true;
            }
            if (last.bloque_entonces.length > 0) {
                if (deleteLastCommandRecursive(last.bloque_entonces)) return true;
            }
        }
        block.pop();
        return true;
    };

    const handleDeleteLastCommand = () => {
        if (state.isExecuting) return;
        deleteLastCommandRecursive(state.commandQueue);
        openAllBlocks(state.commandQueue);
        render();
    };

    const handleDefineProcedure = () => {
        if (state.isExecuting || isProcedureNameInvalid() || state.commandQueue.length === 0) return;
        const name = state.procedureName.trim();
        state.procedures.set(name, deepClone(state.commandQueue));
        state.procedureName = '';
        dom.procedureNameInput.value = '';
        resetAll();
        render();
    };

    // --- CODE GENERATION & TEXT EXPORT ---
    const generateCodeFromQueue = (queue, indentLevel = 0) => {
        const indent = '  '.repeat(indentLevel);
        let code = '';
        for (const command of queue) {
            if (command.type === 'primitiva' || command.type === 'procedimiento') {
                code += `${indent}${command.type === 'procedimiento' ? `${command.nombre}()` : command.nombre}\n`;
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
    };

    // --- EXECUTION LOGIC ---
    const executeSequence = async (commands = state.commandQueue) => {
        const isRootCall = commands === state.commandQueue;
        if (isRootCall) {
            if (state.isExecuting) return;
            state.isExecuting = true;
            resetGridAndCursor();
            render();
            await delay(150);
        }

        for (const command of commands) {
            if (!state.isExecuting) break;

            switch (command.type) {
                case 'primitiva':
                    await executePrimitiveCommand(command.nombre);
                    break;
                case 'procedimiento':
                    const procedureSequence = state.procedures.get(command.nombre);
                    if (procedureSequence) await executeSequence(deepClone(procedureSequence));
                    break;
                case 'repetir':
                    for (let i = 0; i < command.veces; i++) {
                        if (!state.isExecuting) break;
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
        }

        if (isRootCall) {
            state.isExecuting = false;
            render();
        }
    };

    const executePrimitiveCommand = async (name) => {
        const { x, y } = state.cursor;
        let boundaryError = false;
        switch (name) {
            case 'MoverDerecha':
                if (x < state.gridWidth - 1) state.cursor.x++; else boundaryError = true;
                break;
            case 'MoverIzquierda':
                if (x > 0) state.cursor.x--; else boundaryError = true;
                break;
            case 'MoverAbajo':
                if (y > 0) state.cursor.y--; else boundaryError = true;
                break;
            case 'MoverArriba':
                if (y < state.gridHeight - 1) state.cursor.y++; else boundaryError = true;
                break;
            case 'PintarNegro': paintCell(x, y, colors.black); break;
            case 'PintarRojo': paintCell(x, y, colors.red); break;
            case 'PintarVerde': paintCell(x, y, colors.green); break;
            case 'Limpiar': paintCell(x, y, colors.transparent); break;
        }
        if (boundaryError) await handleBoundaryError();
        renderGrid();
        await delay(100);
    };

    const paintCell = (x, y, color) => {
        const visualY = state.gridHeight - 1 - y;
        if (state.grid[visualY] && state.grid[visualY][x]) {
            state.grid[visualY][x].color = color;
        }
    };

    const evaluarCondicion = (condicion) => {
        const { x, y } = state.cursor;
        const visualY = state.gridHeight - 1 - y;
        const cell = state.grid[visualY][x];
        switch (condicion.nombre) {
            case 'estaVacia?': return cell.color === colors.transparent;
            case 'estaPintadaDeNegro?': return cell.color === colors.black;
            case 'estaPintadaDeRojo?': return cell.color === colors.red;
            case 'estaPintadaDeVerde?': return cell.color === colors.green;
            default: return false;
        }
    };

    const handleBoundaryError = async () => {
        showErrorMessage('Error: Movimiento fuera de límites');
        const { x, y } = state.cursor;
        const visualY = state.gridHeight - 1 - y;
        const originalColor = state.grid[visualY][x].color;
        paintCell(x, y, colors.error);
        renderGrid();
        await delay(300);
        paintCell(x, y, originalColor);
        renderGrid();
    };

    // --- FILE I/O and MODAL LOGIC ---
    const toggleModal = (isOpen) => {
        state.isModalOpen = isOpen;
        render();
    };

    const saveToFile = () => {
        const programState = {
            commandQueue: state.commandQueue,
            procedures: Object.fromEntries(state.procedures),
        };
        const data = JSON.stringify(programState, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'qdraw-session.json';
        a.click();
        URL.revokeObjectURL(url);
        toggleModal(false);
    };

    const loadFile = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const stateToLoad = JSON.parse(e.target.result);
                if (!stateToLoad || typeof stateToLoad.procedures !== 'object' || !Array.isArray(stateToLoad.commandQueue)) {
                    throw new Error('Invalid file format.');
                }
                resetAll();
                state.procedures = new Map(Object.entries(stateToLoad.procedures));
                state.commandQueue = stateToLoad.commandQueue;
                render();
                toggleModal(false);
            } catch (error) {
                showErrorMessage('Error: Archivo corrupto o con formato inválido.');
                toggleModal(false);
            }
        };
        reader.onerror = () => showErrorMessage('Error al leer el archivo.');
        reader.readAsText(file);
        event.target.value = ''; // Reset for re-upload
    };

    const generateProgramString = () => {
        let code = 'programa {\n' + generateCodeFromQueue(state.commandQueue, 1) + '}\n\n';
        state.procedures.forEach((body, name) => {
            code += `procedimiento ${name}() {\n` + generateCodeFromQueue(body, 1) + '}\n\n';
        });
        return code.trim();
    };

    const generateGridString = () => {
        let gridStr = '--- ESTADO DE LA GRILLA ---\n';
        const visualCursorY = state.gridHeight - 1 - state.cursor.y;
        for (let y = 0; y < state.gridHeight; y++) {
            let rowStr = '';
            for (let x = 0; x < state.gridWidth; x++) {
                const cell = state.grid[y][x];
                let char = '.';
                if (cell.color === colors.black) char = 'N';
                else if (cell.color === colors.red) char = 'R';
                else if (cell.color === colors.green) char = 'V';
                rowStr += (state.cursor.x === x && visualCursorY === y) ? `[${char}]` : ` ${char} `;
            }
            gridStr += rowStr + '\n';
        }
        return gridStr;
    };

    const exportToTxt = () => {
        state.exportPreviewContent = `${generateProgramString()}\n\n${generateGridString()}`;
        dom.exportPreviewTextarea.value = state.exportPreviewContent;
        state.isExportPreviewModalOpen = true;
        render();
    };

    const savePreviewedTxt = () => {
        const content = dom.exportPreviewTextarea.value;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'qdraw-export.txt';
        a.click();
        URL.revokeObjectURL(url);
        state.isExportPreviewModalOpen = false;
        toggleModal(false);
    };

    // --- EVENT LISTENERS ---
    const setupEventListeners = () => {
        // Inputs
        dom.repeatCountInput.addEventListener('input', e => {
            const val = parseInt(e.target.value, 10);
            state.repeatCount = !isNaN(val) && val > 0 ? val : null;
        });
        dom.repeatCountInput.addEventListener('blur', () => {
            if (state.repeatCount === null) {
                state.repeatCount = 1;
                dom.repeatCountInput.value = 1;
            }
        });
        dom.procedureNameInput.addEventListener('input', e => {
            state.procedureName = e.target.value;
            updateButtonStates();
        });
        dom.gridWidthInput.addEventListener('input', e => state.newGridWidth = parseInt(e.target.value, 10));
        dom.gridHeightInput.addEventListener('input', e => state.newGridHeight = parseInt(e.target.value, 10));

        // Structure Buttons
        dom.addRepeatButton.addEventListener('click', handleAddRepeat);
        dom.addIfButton.addEventListener('click', handleAddIf);
        dom.addElseButton.addEventListener('click', handleAddElse);
        dom.closeBlockButton.addEventListener('click', handleCloseBlock);

        // Control Buttons
        dom.defineProcedureButton.addEventListener('click', handleDefineProcedure);
        dom.runButton.addEventListener('click', () => executeSequence());
        dom.deleteLastCommandButton.addEventListener('click', handleDeleteLastCommand);
        dom.resetButton.addEventListener('click', resetAll);
        dom.applyGridSizeButton.addEventListener('click', () => {
            if (state.isExecuting) return;
            state.gridWidth = Math.max(1, Math.min(50, state.newGridWidth));
            state.gridHeight = Math.max(1, Math.min(50, state.newGridHeight));
            dom.gridWidthInput.value = state.gridWidth;
            dom.gridHeightInput.value = state.gridHeight;
            resetAll();
        });

        // Modal and File I/O Buttons
        dom.fileModalButton.addEventListener('click', () => toggleModal(true));
        dom.closeFileModalButton.addEventListener('click', () => toggleModal(false));
        dom.saveSessionButton.addEventListener('click', saveToFile);
        dom.loadSessionButton.addEventListener('click', () => dom.fileInput.click());
        dom.fileInput.addEventListener('change', loadFile);
        dom.exportTxtButton.addEventListener('click', exportToTxt);
        dom.cancelExportPreviewButton.addEventListener('click', () => {
            state.isExportPreviewModalOpen = false;
            render();
        });
        dom.savePreviewedTxtButton.addEventListener('click', savePreviewedTxt);
    };

    // --- INITIALIZATION ---
    const init = () => {
        setupEventListeners();
        resetGridAndCursor();
        render();
    };

    init();
});
