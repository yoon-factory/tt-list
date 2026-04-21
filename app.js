document.addEventListener('DOMContentLoaded', () => {
            const todoInput = document.getElementById('todo-input');
            const addTodoBtn = document.getElementById('add-todo-btn');
            const todoList = document.getElementById('todo-list');
            const completedList = document.getElementById('completed-list');
            const trashList = document.getElementById('trash-list');
            const clearTrashBtn = document.getElementById('clear-trash-btn');
            const backupBtn = document.getElementById('backup-btn');
            const restoreBtn = document.getElementById('restore-btn');
            const groupPanel = document.getElementById('group-panel');
            const trashContainer = document.querySelector('.trash-container');
            const trashTitle = trashContainer ? trashContainer.querySelector('h2') : null;
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');
            const progressCount = document.getElementById('progress-count');
            const clockTitle = document.getElementById('clock-title');
            const restoreFileInput = document.createElement('input');
            restoreFileInput.type = 'file';
            restoreFileInput.accept = 'application/json,.json';
            restoreFileInput.style.display = 'none';
            document.body.appendChild(restoreFileInput);

            // storage
            // 저장 키 / 로컬 저장소
            const STORAGE_ALL = 'allTodoTasks';
            const STORAGE_COMPLETED = 'completedTasks';
            const STORAGE_TRASH = 'deletedTasks';
            const STORAGE_GROUPS = 'groups';
            const DEFAULT_GROUP_COUNT = 10;

            // data
            let nextTodoId = 1;
            let deletedTasks = [];
            let completedTasks = [];
            let groups = [];
            let currentGroupId = 1;
            let editingTodoId = null;

            // 저장 / 복원 헬퍼
            const getAllTasks = () => JSON.parse(localStorage.getItem(STORAGE_ALL) || '[]');
            const setAllTasks = (tasks) => localStorage.setItem(STORAGE_ALL, JSON.stringify(tasks));
            const setTrashTasks = (tasks) => localStorage.setItem(STORAGE_TRASH, JSON.stringify(tasks));
            const setCompletedTasks = (tasks) => localStorage.setItem(STORAGE_COMPLETED, JSON.stringify(tasks));
            const setGroups = () => localStorage.setItem(STORAGE_GROUPS, JSON.stringify(groups));
            const getTaskById = (taskId) => getAllTasks().find(task => task.id === taskId);
            const getTodoTasksForCurrentGroup = () => getAllTasks().filter(task => task.groupId === currentGroupId);
            const getCompletedTasksForCurrentGroup = () => completedTasks.filter(task => task.groupId === currentGroupId);
            const getTrashTasksForCurrentGroup = () => deletedTasks.filter(task => task.groupId === currentGroupId);

            const ensureGroups = () => {
                if (!Array.isArray(groups) || groups.length === 0) {
                    groups = Array.from({ length: DEFAULT_GROUP_COUNT }, (_, index) => ({
                        id: index + 1,
                        name: `그룹 ${index + 1}`
                    }));
                }
                if (!groups.some(group => group.id === currentGroupId)) {
                    currentGroupId = groups[0].id;
                }
            };

            const setTrashCollapsed = (collapsed) => {
                if (!trashContainer || !trashTitle) return;
                trashContainer.classList.toggle('collapsed', collapsed);
                trashTitle.setAttribute('aria-expanded', String(!collapsed));
            };

            const buildBackupPayload = () => ({
                version: 1,
                exportedAt: new Date().toISOString(),
                allTodoTasks: getAllTasks(),
                completedTasks,
                deletedTasks,
                groups
            });

            const downloadJson = (filename, data) => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            };

            // render
            // render / 공통 UI 헬퍼
            const displayErrorMessage = (message) => {
                const existing = document.querySelector('.error-message');
                if (existing) existing.remove();
                const div = document.createElement('div');
                div.className = 'error-message';
                div.textContent = message;
                document.body.prepend(div);
                setTimeout(() => div.remove(), 3000);
            };

            const updateClock = () => {
                const now = new Date();
                clockTitle.textContent = [
                    `${String(now.getHours()).padStart(2, '0')}시`,
                    `${String(now.getMinutes()).padStart(2, '0')}분`,
                    `${String(now.getSeconds()).padStart(2, '0')}:${String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0')}`
                ].join(' ');
            };

            // 진행률 계산
            const updateProgressBar = () => {
                const allTasks = getAllTasks();
                const groupTasks = allTasks.filter(task => task.groupId === currentGroupId);
                const completedCount = groupTasks.filter(task => task.completed).length;
                const completedListCount = getCompletedTasksForCurrentGroup().length;
                const trashCount = getTrashTasksForCurrentGroup().length;
                const total = groupTasks.length + completedListCount + trashCount;
                const done = completedCount + completedListCount + trashCount;

                progressCount.textContent = `${done} / ${total}`;
                if (total === 0) {
                    progressBar.style.width = '0%';
                    progressText.textContent = '0% 완료';
                    return;
                }
                const percentage = Math.round((done / total) * 100);
                progressBar.style.width = `${percentage}%`;
                progressText.textContent = `${percentage}% 완료`;
            };

            // 그룹 렌더 / 편집
            const renderGroups = () => {
                Array.from(groupPanel.querySelectorAll('.group-btn, .group-edit-input')).forEach(btn => btn.remove());
                const actionContainer = document.querySelector('.group-action-buttons');
                groups.forEach(group => {
                    const btn = document.createElement('button');
                    btn.className = 'group-btn';
                    if (group.id === currentGroupId) btn.classList.add('active');
                    btn.textContent = group.name;
                    btn.onclick = () => {
                        currentGroupId = group.id;
                        renderAll();
                    };
                    btn.ondblclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        makeGroupEditable(btn, group);
                    };
                    btn.oncontextmenu = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        makeGroupEditable(btn, group);
                    };
                    groupPanel.insertBefore(btn, actionContainer);
                });
            };

            const makeGroupEditable = (buttonElement, group) => {
                const input = document.createElement('input');
                input.type = 'text';
                input.value = group.name;
                input.className = 'group-edit-input';
                buttonElement.replaceWith(input);
                input.focus();

                const finish = () => {
                    const nextName = input.value.trim();
                    if (nextName) {
                        group.name = nextName;
                        setGroups();
                    }
                    renderAll();
                };

                input.onblur = finish;
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') input.blur();
                    if (e.key === 'Escape') renderAll();
                };
            };

            // mutations
            const setTaskState = (taskId, updater) => {
                const tasks = getAllTasks();
                const index = tasks.findIndex(task => task.id === taskId);
                if (index === -1) return;
                tasks[index] = updater(tasks[index]);
                setAllTasks(tasks);
            };

            const setTaskSelected = (taskId) => {
                setTaskState(taskId, (task) => ({
                    ...task,
                    selectedForDelete: true,
                    deleteSelectedAt: Date.now()
                }));
            };

            const setTaskCompleted = (taskId) => {
                setTaskState(taskId, (task) => ({
                    ...task,
                    completed: true,
                    selectedForDelete: false,
                    deleteSelectedAt: ''
                }));
            };

            const restoreCompletedTaskToTodo = (taskId) => {
                setTaskState(taskId, (task) => ({
                    ...task,
                    completed: false,
                    selectedForDelete: false,
                    deleteSelectedAt: ''
                }));
            };

            const moveTodoItemToCompletedList = (taskId) => {
                const tasks = getAllTasks();
                const index = tasks.findIndex(task => task.id === taskId);
                if (index === -1) return;
                completedTasks.push({ ...tasks[index] });
                tasks.splice(index, 1);
                setAllTasks(tasks);
                setCompletedTasks(completedTasks);
            };

            const moveCompletedItemToTrashList = (taskId) => {
                const index = completedTasks.findIndex(task => task.id === taskId);
                if (index === -1) return;
                deletedTasks.push({ ...completedTasks[index] });
                completedTasks.splice(index, 1);
                setCompletedTasks(completedTasks);
                setTrashTasks(deletedTasks);
            };

            const restoreCompletedItemToTodoList = (taskId) => {
                const index = completedTasks.findIndex(task => task.id === taskId);
                if (index === -1) return;
                const restored = {
                    ...completedTasks[index],
                    completed: false,
                    selectedForDelete: false,
                    deleteSelectedAt: ''
                };
                completedTasks.splice(index, 1);
                const allTasks = getAllTasks();
                allTasks.push(restored);
                setAllTasks(allTasks);
                setCompletedTasks(completedTasks);
            };

            const permanentlyDeleteTrashItem = (taskId) => {
                deletedTasks = deletedTasks.filter(task => task.id !== taskId);
                setTrashTasks(deletedTasks);
            };

            const restoreTrashItemToCompletedList = (taskId) => {
                const index = deletedTasks.findIndex(task => task.id === taskId);
                if (index === -1) return;
                completedTasks.push({ ...deletedTasks[index] });
                deletedTasks.splice(index, 1);
                setCompletedTasks(completedTasks);
                setTrashTasks(deletedTasks);
            };

            // render / 리스트
            const startCountdown = (span, startedAt) => {
                const tick = () => {
                    const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
                    span.textContent = `${elapsed.toFixed(2)}초`;
                };
                tick();
                return setInterval(tick, 100);
            };

            const createTodoElement = (task) => {
                const li = document.createElement('li');
                li.className = 'todo-item';
                li.dataset.id = task.id;
                li.dataset.originalDate = task.date || '';
                if (task.selectedForDelete) li.classList.add('selected-for-delete');
                if (task.completed) li.classList.add('completed');
                li.innerHTML = `
                    <div class="todo-item-content">
                        <input type="checkbox" class="todo-checkbox" ${task.completed ? 'checked' : ''}>
                        <span class="todo-item-text">${task.text}</span>
                        <span class="todo-item-datetime">${task.date || ''}</span>
                    </div>
                `;

                const dateElement = li.querySelector('.todo-item-datetime');
                const checkbox = li.querySelector('.todo-checkbox');
                let countdownTimer = null;

                const clearCountdown = () => {
                    if (countdownTimer) clearInterval(countdownTimer);
                    countdownTimer = null;
                    dateElement.textContent = li.dataset.originalDate || '';
                };

                if (task.selectedForDelete && task.deleteSelectedAt) {
                    countdownTimer = startCountdown(dateElement, Number(task.deleteSelectedAt));
                }

                checkbox.onchange = (e) => {
                    e.stopPropagation();
                    setTaskState(task.id, (current) => ({
                        ...current,
                        completed: checkbox.checked
                    }));
                    renderAll();
                };

                li.onclick = (e) => {
                    if (editingTodoId !== null) return;
                    if (e.target.closest('.todo-checkbox') || e.target.classList.contains('edit-input')) return;

                    const current = getTaskById(task.id);
                    if (!current) return;

                    // 3) 완료 -> 완료 보관함
                    if (current.completed) {
                        moveTodoItemToCompletedList(task.id);
                        renderAll();
                        return;
                    }

                    // 1) 기본 -> 2) 진행
                    if (!current.selectedForDelete) {
                        setTaskSelected(task.id);
                        renderAll();
                        return;
                    }

                    // 2) 진행 -> 3) 완료
                    if (current.selectedForDelete) {
                        clearCountdown();
                        setTaskCompleted(task.id);
                        renderAll();
                    }
                };

                li.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const current = getTaskById(task.id);
                    if (!current) return;

                    if (current.completed) {
                        restoreCompletedTaskToTodo(task.id);
                        renderAll();
                        return;
                    }

                    if (current.selectedForDelete) {
                        setTaskState(task.id, (currentTask) => ({
                            ...currentTask,
                            selectedForDelete: false,
                            deleteSelectedAt: ''
                        }));
                        renderAll();
                        return;
                    }

                    if (editingTodoId !== null) return;
                    editingTodoId = task.id;
                    const textSpan = li.querySelector('.todo-item-text');
                    const input = document.createElement('input');
                    input.className = 'edit-input';
                    input.value = textSpan.textContent;
                    textSpan.replaceWith(input);
                    li.classList.add('editing');

                    const confirmBtn = document.createElement('button');
                    confirmBtn.type = 'button';
                    confirmBtn.className = 'confirm-edit-btn';
                    confirmBtn.textContent = '확인';
                    li.appendChild(confirmBtn);

                    const finish = () => {
                        const nextText = input.value.trim();
                        textSpan.textContent = nextText || textSpan.textContent;
                        input.replaceWith(textSpan);
                        confirmBtn.remove();
                        li.classList.remove('editing');
                        editingTodoId = null;
                        setTaskState(task.id, (currentTask) => ({
                            ...currentTask,
                            text: nextText || currentTask.text
                        }));
                        renderAll();
                    };

                    confirmBtn.onclick = (ev) => {
                        ev.stopPropagation();
                        finish();
                    };
                    input.onblur = finish;
                    input.onkeydown = (ev) => {
                        if (ev.key === 'Enter') finish();
                    };
                };

                return li;
            };

            const renderTodoList = () => {
                todoList.innerHTML = '';
                const items = getTodoTasksForCurrentGroup().sort((a, b) => b.id - a.id);
                if (items.length === 0) {
                    const empty = document.createElement('li');
                    empty.className = 'no-todo-item';
                    empty.textContent = '현재 그룹에 할 일이 없습니다.';
                    todoList.appendChild(empty);
                    return;
                }
                items.forEach(task => todoList.appendChild(createTodoElement(task)));
            };

            const renderCompletedList = () => {
                completedList.innerHTML = '';
                const items = getCompletedTasksForCurrentGroup().sort((a, b) => b.id - a.id);
                if (items.length === 0) {
                    const empty = document.createElement('li');
                    empty.className = 'no-todo-item';
                    empty.textContent = '완료 보관함이 비어 있습니다.';
                    completedList.appendChild(empty);
                    return;
                }
                items.forEach(task => {
                    const li = document.createElement('li');
                    li.className = 'completed-item';
                    li.dataset.id = task.id;
                    li.innerHTML = `
                        <span class="completed-item-text">${task.text}</span>
                        <span class="todo-item-datetime">${task.date || ''}</span>
                        <div class="completed-item-actions">
                            <button type="button" class="move-to-trash-btn">휴지통2</button>
                        </div>
                    `;
                    li.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        moveCompletedItemToTrashList(task.id);
                        renderAll();
                    };
                    li.querySelector('.move-to-trash-btn').onclick = (e) => {
                        e.stopPropagation();
                        moveCompletedItemToTrashList(task.id);
                        renderAll();
                    };
                    li.oncontextmenu = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        restoreCompletedItemToTodoList(task.id);
                        renderAll();
                    };
                    completedList.appendChild(li);
                });
            };

            const renderTrash = () => {
                trashList.innerHTML = '';
                const items = getTrashTasksForCurrentGroup().sort((a, b) => b.id - a.id);
                if (items.length === 0) {
                    const empty = document.createElement('li');
                    empty.className = 'no-trash-item';
                    empty.textContent = '삭제된 항목이 없습니다.';
                    trashList.appendChild(empty);
                    clearTrashBtn.style.display = 'none';
                    return;
                }
                clearTrashBtn.style.display = 'inline-block';
                items.forEach(task => {
                    const li = document.createElement('li');
                    li.className = 'trash-item';
                    li.innerHTML = `
                        <span class="trash-item-text">${task.text} ${task.date || ''}</span>
                        <div class="trash-item-actions"><button class="permanent-delete-btn">영구삭제</button></div>
                    `;
                    li.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        permanentlyDeleteTrashItem(task.id);
                        renderAll();
                    };
                    li.oncontextmenu = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        restoreTrashItemToCompletedList(task.id);
                        renderAll();
                    };
                    li.querySelector('.permanent-delete-btn').onclick = (e) => {
                        e.stopPropagation();
                        permanentlyDeleteTrashItem(task.id);
                        renderAll();
                    };
                    trashList.appendChild(li);
                });
            };

            // render / 전체
            const renderAll = () => {
                ensureGroups();
                renderGroups();
                renderTodoList();
                renderCompletedList();
                renderTrash();
                updateProgressBar();
            };

            // events
            // events / 입력
            const addTask = () => {
                const text = todoInput.value.trim();
                if (!text) {
                    displayErrorMessage('할 일을 입력해주세요!');
                    return;
                }
                const now = new Date();
                const task = {
                    id: nextTodoId++,
                    groupId: currentGroupId,
                    text,
                    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                    completed: false,
                    selectedForDelete: false,
                    deleteSelectedAt: ''
                };
                const allTasks = getAllTasks();
                allTasks.push(task);
                setAllTasks(allTasks);
                todoInput.value = '';
                renderAll();
            };

            const switchGroupByOffset = (offset) => {
                if (!groups.length) return;
                const currentIndex = Math.max(0, groups.findIndex(group => group.id === currentGroupId));
                const nextIndex = (currentIndex + offset + groups.length) % groups.length;
                currentGroupId = groups[nextIndex].id;
                renderAll();
            };

            addTodoBtn.onclick = addTask;
            todoInput.onkeypress = (e) => {
                if (e.key === 'Enter') addTask();
            };

            document.addEventListener('keydown', (e) => {
                if (e.repeat) return;
                if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
                if (e.target && e.target.isContentEditable) return;
                if (e.key === '1') {
                    e.preventDefault();
                    switchGroupByOffset(-1);
                }
                if (e.key === '2') {
                    e.preventDefault();
                    switchGroupByOffset(1);
                }
            });

            backupBtn.onclick = () => {
                downloadJson(`todo-backup-${new Date().toISOString().slice(0, 10)}.json`, buildBackupPayload());
            };

            restoreBtn.onclick = () => {
                restoreFileInput.value = '';
                restoreFileInput.click();
            };

            restoreFileInput.onchange = async () => {
                const file = restoreFileInput.files && restoreFileInput.files[0];
                if (!file) return;
                try {
                    const payload = JSON.parse(await file.text());
                    const allTasks = Array.isArray(payload.allTodoTasks) ? payload.allTodoTasks : [];
                    completedTasks = Array.isArray(payload.completedTasks) ? payload.completedTasks : [];
                    deletedTasks = Array.isArray(payload.deletedTasks) ? payload.deletedTasks : [];
                    const backupGroups = Array.isArray(payload.groups) && payload.groups.length > 0 ? payload.groups : null;
                    if (backupGroups) {
                        groups = backupGroups;
                    }
                    ensureGroups();
                    currentGroupId = groups[0].id;
                    setAllTasks(allTasks);
                    setCompletedTasks(completedTasks);
                    setTrashTasks(deletedTasks);
                    setGroups();
                    renderAll();
                    displayErrorMessage('백업 파일을 복원했습니다.');
                } catch (error) {
                    displayErrorMessage('복원에 실패했습니다. JSON 파일을 확인해주세요.');
                }
            };

            clearTrashBtn.onclick = () => {
                deletedTasks = [];
                setTrashTasks(deletedTasks);
                renderAll();
            };

            // 그룹 버튼 이벤트
            const addGroupBtn = document.getElementById('add-group-btn');
            const removeGroupBtn = document.getElementById('remove-group-btn');
            addGroupBtn.onclick = () => {
                if (groups.length >= DEFAULT_GROUP_COUNT) {
                    displayErrorMessage('그룹은 최대 10개까지 생성할 수 있습니다.');
                    return;
                }
                const newId = Math.max(...groups.map(group => group.id), 0) + 1;
                groups.push({ id: newId, name: `새 그룹 ${newId}` });
                currentGroupId = newId;
                setGroups();
                renderAll();
            };
            removeGroupBtn.onclick = () => {
                if (groups.length === 1) {
                    displayErrorMessage('마지막 그룹은 삭제할 수 없습니다.');
                    return;
                }
                const currentTodo = getTodoTasksForCurrentGroup();
                if (currentTodo.length > 0) {
                    displayErrorMessage('그룹에 할 일이 남아있으면 삭제할 수 없습니다.');
                    return;
                }
                completedTasks = completedTasks.filter(task => task.groupId !== currentGroupId);
                deletedTasks = deletedTasks.filter(task => task.groupId !== currentGroupId);
                setCompletedTasks(completedTasks);
                setTrashTasks(deletedTasks);
                groups = groups.filter(group => group.id !== currentGroupId);
                currentGroupId = groups[0].id;
                setGroups();
                renderAll();
            };

            // 초기화
            const loadTasks = () => {
                const savedAll = JSON.parse(localStorage.getItem(STORAGE_ALL) || '[]');
                completedTasks = JSON.parse(localStorage.getItem(STORAGE_COMPLETED) || '[]');
                deletedTasks = JSON.parse(localStorage.getItem(STORAGE_TRASH) || '[]');
                groups = JSON.parse(localStorage.getItem(STORAGE_GROUPS) || '[]');
                ensureGroups();
                let maxId = 0;
                [...savedAll, ...completedTasks, ...deletedTasks].forEach(task => {
                    if (task.id > maxId) maxId = task.id;
                });
                nextTodoId = maxId + 1;
                setAllTasks(savedAll);
                setCompletedTasks(completedTasks);
                setTrashTasks(deletedTasks);
                setGroups();
                renderAll();
            };

            if (trashTitle) {
                trashTitle.setAttribute('role', 'button');
                trashTitle.setAttribute('tabindex', '0');
                trashTitle.setAttribute('aria-expanded', 'false');
                trashTitle.onclick = () => {
                    setTrashCollapsed(!trashContainer.classList.contains('collapsed'));
                };
                trashTitle.onkeydown = (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        trashTitle.click();
                    }
                };
            }

            updateClock();
            setInterval(updateClock, 100);
            loadTasks();
        });
