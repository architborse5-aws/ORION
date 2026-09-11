let projectsCache = [];
let agentsCache = [];

function showSection(id, button) {
    document.querySelectorAll(".section").forEach(section => {
        section.classList.remove("active");
    });

    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    document.getElementById(id).classList.add("active");
    button.classList.add("active");
}

let orionAuthToken =
    sessionStorage.getItem("orion_access_token") || "";

let orionCurrentUser = null;


async function api(url, options = {}) {

    const authHeaders =
        orionAuthToken
            ? {
                "Authorization":
                    `Bearer ${orionAuthToken}`
            }
            : {};


    const response = await fetch(url, {
        ...options,

        headers: {
            "Content-Type": "application/json",
            ...authHeaders,
            ...(options.headers || {})
        }
    });


    if (response.status === 401) {

        if (orionAuthToken) {
            clearOrionSession();
            showOrionLogin(
                "Your session expired. Please sign in again."
            );
        }
    }


    if (!response.ok) {
        throw new Error(
            await response.text()
        );
    }


    return response.json();
}

async function loadMonitoring() {
    const data = await api("/api/monitoring/system");

    document.getElementById("cpu").textContent = data.cpu.usage_percent + "%";
    document.getElementById("memory").textContent = data.memory.usage_percent + "%";
    document.getElementById("disk").textContent = data.disk.usage_percent + "%";
    document.getElementById("uptime").textContent = data.uptime.formatted;

    document.getElementById("monitorCpu").textContent = data.cpu.usage_percent + "%";
    document.getElementById("monitorMemory").textContent = data.memory.usage_percent + "%";
    document.getElementById("monitorDisk").textContent = data.disk.usage_percent + "%";
    document.getElementById("monitorUptime").textContent = data.uptime.formatted;
}

async function loadProjects() {
    projectsCache = await api("/api/projects");
    document.getElementById("projectCount").textContent = projectsCache.length;

    const table = document.getElementById("projectTable");
    table.innerHTML = "";

    projectsCache.forEach(project => {
        table.innerHTML += `
        <tr>
            <td>${project.id}</td>
            <td>${project.name}</td>
            <td>${project.status}</td>
            <td>${project.progress}%</td>
            <td>
                <button onclick="deleteProject(${project.id})">Delete</button>
            </td>
        </tr>
        `;
    });

    updateSelectors();
}

async function createProject() {
    const name = document.getElementById("projectName").value.trim();

    if (!name) {
        alert("Enter project name");
        return;
    }

    await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({
            name: name,
            description: document.getElementById("projectDescription").value,
            status: "planning",
            progress: 0
        })
    });

    document.getElementById("projectName").value = "";
    document.getElementById("projectDescription").value = "";

    await loadProjects();
}

async function deleteProject(id) {
    await api("/api/projects/" + id, {
        method: "DELETE"
    });

    await loadProjects();
}

async function loadAgents() {
    agentsCache = await api("/api/agents");
    document.getElementById("agentCount").textContent = agentsCache.length;

    const table = document.getElementById("agentTable");
    table.innerHTML = "";

    agentsCache.forEach(agent => {
        table.innerHTML += `
        <tr>
            <td>${agent.id}</td>
            <td>${agent.name}</td>
            <td>${agent.role}</td>
            <td>${agent.status}</td>
            <td>
                <button onclick="deleteAgent(${agent.id})">Delete</button>
            </td>
        </tr>
        `;
    });

    updateSelectors();
}

async function createAgent() {
    const name = document.getElementById("agentName").value.trim();
    const role = document.getElementById("agentRole").value.trim();

    if (!name || !role) {
        alert("Enter name and role");
        return;
    }

    await api("/api/agents", {
        method: "POST",
        body: JSON.stringify({
            name: name,
            role: role,
            status: "online",
            current_task: ""
        })
    });

    document.getElementById("agentName").value = "";
    document.getElementById("agentRole").value = "";

    await loadAgents();
}

async function deleteAgent(id) {
    await api("/api/agents/" + id, {
        method: "DELETE"
    });

    await loadAgents();
}

function updateSelectors() {
    const projectSelect = document.getElementById("taskProject");
    const agentSelect = document.getElementById("taskAgent");

    if (!projectSelect || !agentSelect) return;

    projectSelect.innerHTML = '<option value="">No Project</option>';
    agentSelect.innerHTML = '<option value="">Unassigned</option>';

    projectsCache.forEach(project => {
        projectSelect.innerHTML += `<option value="${project.id}">${project.name}</option>`;
    });

    agentsCache.forEach(agent => {
        agentSelect.innerHTML += `<option value="${agent.id}">${agent.name}</option>`;
    });
}

async function loadTasks() {

    const tasks = await api("/api/tasks");

    const countElement =
        document.getElementById("taskCount");

    if (countElement) {
        countElement.textContent = tasks.length;
    }

    const table =
        document.getElementById("taskTable");

    if (!table) return;

    table.innerHTML = "";


    tasks.forEach(task => {

        const project =
            projectsCache.find(
                p => p.id === task.project_id
            );

        const agent =
            agentsCache.find(
                a => a.id === task.agent_id
            );


        let statusClass =
            "task-status todo-status";


        if (task.status === "completed") {

            statusClass =
                "task-status completed-status";

        }

        else if (task.status === "in_progress") {

            statusClass =
                "task-status progress-status";

        }

        else if (task.status === "blocked") {

            statusClass =
                "task-status blocked-status";

        }


        const runText =
            task.status === "completed"
                ? "↻ Run Again"
                : "▶ Run Task";


        const disabled =
            task.status === "in_progress"
                ? "disabled"
                : "";


        table.innerHTML += `

        <tr>

            <td>
                ${task.id}
            </td>


            <td>

                <strong class="task-title">
                    ${escapeOrionHTML(task.title)}
                </strong>

                <div class="task-mini-priority">
                    ${escapeOrionHTML(
                        task.priority || "medium"
                    )}
                </div>

            </td>


            <td>

                <span class="${statusClass}">
                    ${escapeOrionHTML(
                        task.status || "todo"
                    )}
                </span>

            </td>


            <td>

                ${
                    project
                        ? escapeOrionHTML(project.name)
                        : "-"
                }

            </td>


            <td>

                ${
                    agent
                        ? escapeOrionHTML(agent.name)
                        : "Unassigned"
                }

            </td>


            <td class="task-actions">

                <button
                    class="run-task-btn"
                    onclick="runTask(${task.id}, this)"
                    ${disabled}
                >
                    ${runText}
                </button>


                <button
                    class="view-report-btn"
                    onclick="viewTaskReport(${task.id})"
                >
                    📄 View Report
                </button>

                <button
                    class="delete-task-btn"
                    onclick="deleteTask(${task.id})"
                >
                    Delete
                </button>

            </td>

        </tr>


        <tr
            id="task-result-row-${task.id}"
            class="task-result-row"
            style="display:none;"
        >

            <td colspan="6">

                <div
                    id="task-result-${task.id}"
                    class="task-result-box"
                >
                </div>

            </td>

        </tr>

        `;

    });

}

async function createTask() {
    const title = document.getElementById("taskTitle").value.trim();

    if (!title) {
        alert("Enter task title");
        return;
    }

    const projectId = document.getElementById("taskProject").value;
    const agentId = document.getElementById("taskAgent").value;

    await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
            title: title,
            description: document.getElementById("taskDescription").value,
            status: "todo",
            priority: document.getElementById("taskPriority").value,
            project_id: projectId ? Number(projectId) : null,
            agent_id: agentId ? Number(agentId) : null
        })
    });

    document.getElementById("taskTitle").value = "";
    document.getElementById("taskDescription").value = "";

    await loadTasks();
}

async function deleteTask(id) {
    await api("/api/tasks/" + id, {
        method: "DELETE"
    });

    await loadTasks();
}

async function loadDeployments() {

    const items =
        await api("/api/deployments");

    document.getElementById(
        "deploymentCount"
    ).textContent = items.length;


    const table =
        document.getElementById(
            "deploymentTable"
        );

    table.innerHTML = "";


    items.forEach(item => {

        const status =
            String(
                item.status || "pending"
            ).toLowerCase();

        const safeStatusClass =
            status.replace(
                /[^a-z0-9_-]/g,
                ""
            );


        table.innerHTML += `

            <tr id="deployment-row-${item.id}">

                <td>
                    ${item.id}
                </td>

                <td>
                    <strong>
                        ${escapeOrionHTML(
                            item.name
                        )}
                    </strong>
                </td>

                <td>
                    ${escapeOrionHTML(
                        item.environment
                    )}
                </td>

                <td>
                    ${escapeOrionHTML(
                        item.version
                    )}
                </td>

                <td>

                    <span
                        class="
                            deployment-status
                            deployment-status-${safeStatusClass}
                        "
                    >

                        ${escapeOrionHTML(
                            status.toUpperCase()
                        )}

                    </span>

                </td>


                <td class="deployment-actions">

                    <button
                        class="deployment-run-btn"
                        onclick="
                            runDeployment(
                                ${item.id},
                                this
                            )
                        "
                    >
                        ▶ Deploy
                    </button>


                    <button
                        class="deployment-log-btn"
                        onclick="
                            viewDeploymentLogs(
                                ${item.id}
                            )
                        "
                    >
                        📄 View Logs
                    </button>

                </td>

            </tr>


            <tr
                id="deployment-result-row-${item.id}"
                class="deployment-result-row"
                style="display:none;"
            >

                <td colspan="6">

                    <div
                        id="deployment-result-${item.id}"
                        class="deployment-result-box"
                    >
                    </div>

                </td>

            </tr>

        `;
    });
}


// ============================================================
// ORION REAL DEPLOYMENT UI V1
// ============================================================

async function runDeployment(
    deploymentId,
    button
) {

    const row =
        document.getElementById(
            `deployment-result-row-${deploymentId}`
        );

    const box =
        document.getElementById(
            `deployment-result-${deploymentId}`
        );


    if (!row || !box) {
        console.error(
            "Deployment result container missing"
        );
        return;
    }


    row.style.display = "table-row";

    button.disabled = true;

    button.innerHTML =
        '<span class="run-spinner"></span> Deploying';


    box.innerHTML = `

        <div class="deployment-running">

            <strong>
                ORION DEPLOYMENT ENGINE
            </strong>

            <p>
                Preparing deployment
                #${deploymentId}...
            </p>

            <div class="execution-progress">

                <div
                    class="execution-progress-bar"
                >
                </div>

            </div>

        </div>

    `;


    try {

        const data =
            await api(
                `/api/deployments/${deploymentId}/run`,
                {
                    method: "POST"
                }
            );


        /*
         * Reload deployment table so the
         * database status changes immediately.
         */
        await loadDeployments();


        /*
         * Show the newly-created deployment
         * run and its real server logs.
         */
        await viewDeploymentLogs(
            deploymentId
        );

    }

    catch (error) {

        const message =
            formatDeploymentError(
                error
            );


        box.innerHTML = `

            <div class="deployment-failed">

                <strong>
                    ✕ DEPLOYMENT FAILED
                </strong>

                <p>
                    ${escapeOrionHTML(
                        message
                    )}
                </p>

            </div>

        `;

    }

    finally {

        button.disabled = false;

        button.innerHTML =
            "▶ Deploy";
    }
}


async function viewDeploymentLogs(
    deploymentId
) {

    const row =
        document.getElementById(
            `deployment-result-row-${deploymentId}`
        );

    const box =
        document.getElementById(
            `deployment-result-${deploymentId}`
        );


    if (!row || !box) {
        return;
    }


    row.style.display =
        "table-row";


    box.innerHTML = `

        <div class="deployment-running">

            Loading deployment history...

        </div>

    `;


    try {

        const runs =
            await api(
                `/api/deployments/${deploymentId}/runs`
            );


        if (
            !Array.isArray(runs)
            ||
            runs.length === 0
        ) {

            box.innerHTML = `

                <div class="deployment-empty">

                    <strong>
                        NO DEPLOYMENT RUNS
                    </strong>

                    <p>
                        This deployment has not
                        been executed yet.
                    </p>

                </div>

            `;

            return;
        }


        const latest =
            runs[0];


        const successful =
            latest.status === "success";


        const statusClass =
            successful
                ? "deployment-success"
                : "deployment-failed";


        const verification =
            latest.result?.verified
                ? "VERIFIED"
                : "NOT VERIFIED";


        const history =
            runs
            .slice(0, 5)
            .map(run => {

                return `

                    <div
                        class="deployment-history-item"
                    >

                        <span>
                            Run #${run.id}
                        </span>

                        <span>
                            ${escapeOrionHTML(
                                String(
                                    run.status
                                    || "unknown"
                                ).toUpperCase()
                            )}
                        </span>

                        <span>
                            ${escapeOrionHTML(
                                formatDeploymentDate(
                                    run.created_at
                                )
                            )}
                        </span>

                        <span>
                            ${
                                Number(
                                    run.duration_ms
                                    || 0
                                ).toFixed(2)
                            } ms
                        </span>

                    </div>

                `;

            })
            .join("");


        box.innerHTML = `

            <div class="deployment-report ${statusClass}">


                <div class="deployment-report-header">

                    <div>

                        <strong>

                            ${
                                successful
                                    ? "✓ DEPLOYMENT SUCCESS"
                                    : "✕ DEPLOYMENT FAILED"
                            }

                        </strong>

                        <small>
                            Deployment Run
                            #${latest.id}
                        </small>

                    </div>


                    <span
                        class="deployment-verification"
                    >

                        ${verification}

                    </span>

                </div>


                <div class="deployment-metrics">


                    <div>

                        <span>
                            ENVIRONMENT
                        </span>

                        <strong>
                            ${escapeOrionHTML(
                                latest.environment
                                || "-"
                            )}
                        </strong>

                    </div>


                    <div>

                        <span>
                            VERSION
                        </span>

                        <strong>
                            ${escapeOrionHTML(
                                latest.version
                                || "-"
                            )}
                        </strong>

                    </div>


                    <div>

                        <span>
                            SERVICE
                        </span>

                        <strong>
                            ${escapeOrionHTML(
                                latest.service_name
                                || "-"
                            )}
                        </strong>

                    </div>


                    <div>

                        <span>
                            DURATION
                        </span>

                        <strong>

                            ${
                                Number(
                                    latest.duration_ms
                                    || 0
                                ).toFixed(2)
                            } ms

                        </strong>

                    </div>

                </div>


                <div class="deployment-target">

                    <div>

                        <span>
                            TARGET
                        </span>

                        <strong>
                            ${escapeOrionHTML(
                                latest.target_path
                                || "-"
                            )}
                        </strong>

                    </div>


                    <div>

                        <span>
                            HEALTH CHECK
                        </span>

                        <strong>
                            ${escapeOrionHTML(
                                latest.healthcheck_url
                                || "-"
                            )}
                        </strong>

                    </div>

                </div>


                <div class="deployment-log-panel">

                    <div class="deployment-log-title">

                        ORION DEPLOYMENT LOG

                    </div>

                    <pre>${
                        escapeOrionHTML(
                            latest.logs
                            || "No logs available"
                        )
                    }</pre>

                </div>


                <div class="deployment-history">

                    <strong>
                        Recent Runs
                    </strong>

                    ${history}

                </div>

            </div>

        `;

    }

    catch (error) {

        box.innerHTML = `

            <div class="deployment-failed">

                <strong>
                    LOG LOAD FAILED
                </strong>

                <p>
                    ${escapeOrionHTML(
                        formatDeploymentError(
                            error
                        )
                    )}
                </p>

            </div>

        `;

    }
}


function formatDeploymentDate(
    value
) {

    if (!value) {
        return "-";
    }

    try {

        return new Date(
            value
        ).toLocaleString();

    }

    catch {

        return String(
            value
        );

    }
}


function formatDeploymentError(
    error
) {

    let message =
        error?.message
        || String(error)
        || "Unknown deployment error";


    /*
     * api() returns backend errors as text.
     * Convert JSON details into readable text
     * instead of [object Object].
     */
    try {

        const parsed =
            JSON.parse(
                message
            );


        if (
            typeof parsed.detail
            === "string"
        ) {

            return parsed.detail;
        }


        if (
            parsed.detail
            &&
            typeof parsed.detail
            === "object"
        ) {

            return (
                parsed.detail.message
                ||
                parsed.detail.error
                ||
                JSON.stringify(
                    parsed.detail
                )
            );
        }


        if (parsed.message) {
            return parsed.message;
        }

    }

    catch {
        // Plain-text error; keep original.
    }


    return message;
}

async function createDeployment() {
    const name = document.getElementById("deploymentName").value.trim();

    if (!name) {
        alert("Enter deployment name");
        return;
    }

    await api("/api/deployments", {
        method: "POST",
        body: JSON.stringify({
            name: name,
            version: document.getElementById("deploymentVersion").value || "v1.0.0",
            environment: document.getElementById("deploymentEnvironment").value,
            status: "pending"
        })
    });

    await loadDeployments();
}

async function loadSecurity() {
    const items = await api("/api/security-findings");

    const table = document.getElementById("securityTable");
    table.innerHTML = "";

    items.forEach(item => {
        table.innerHTML += `
        <tr>
            <td>${item.id}</td>
            <td>${item.title}</td>
            <td>${item.severity}</td>
            <td>${item.status}</td>
        </tr>
        `;
    });
}

async function createSecurityFinding() {
    const title = document.getElementById("securityTitle").value.trim();

    if (!title) {
        alert("Enter finding title");
        return;
    }

    await api("/api/security-findings", {
        method: "POST",
        body: JSON.stringify({
            title: title,
            description: document.getElementById("securityDescription").value,
            severity: document.getElementById("securitySeverity").value,
            status: "open"
        })
    });

    await loadSecurity();
}

async function loadSettings() {
    const items = await api("/api/settings");

    const table = document.getElementById("settingsTable");
    table.innerHTML = "";

    items.forEach(item => {
        table.innerHTML += `
        <tr>
            <td>${item.id}</td>
            <td>${item.key}</td>
            <td>${item.value}</td>
        </tr>
        `;
    });
}

async function createSetting() {
    const key = document.getElementById("settingKey").value.trim();

    if (!key) {
        alert("Enter setting key");
        return;
    }

    await api("/api/settings", {
        method: "POST",
        body: JSON.stringify({
            key: key,
            value: document.getElementById("settingValue").value
        })
    });

    await loadSettings();
}


// ============================================================
// ORION BROWSER AUTHENTICATION V1
// ============================================================

function clearOrionSession() {

    sessionStorage.removeItem(
        "orion_access_token"
    );

    orionAuthToken = "";
    orionCurrentUser = null;
}


function showOrionLogin(
    message = ""
) {

    let overlay =
        document.getElementById(
            "orionAuthOverlay"
        );


    if (!overlay) {

        overlay =
            document.createElement(
                "div"
            );

        overlay.id =
            "orionAuthOverlay";

        overlay.className =
            "orion-auth-overlay";


        overlay.innerHTML = `

            <div class="orion-login-card">

                <div class="orion-login-brand">
                    ORION
                </div>

                <h2>
                    Command Center Login
                </h2>

                <p class="orion-login-subtitle">
                    Autonomous Digital Company
                    Operating System
                </p>


                <form id="orionLoginForm">

                    <label>
                        Username
                    </label>

                    <input
                        id="orionLoginUsername"
                        type="text"
                        autocomplete="username"
                        placeholder="Username"
                        required
                    >


                    <label>
                        Password
                    </label>

                    <input
                        id="orionLoginPassword"
                        type="password"
                        autocomplete="current-password"
                        placeholder="Password"
                        required
                    >


                    <div
                        id="orionLoginError"
                        class="orion-login-error"
                    ></div>


                    <button
                        id="orionLoginButton"
                        type="submit"
                    >
                        Sign in to ORION
                    </button>

                </form>

            </div>

        `;


        document.body.appendChild(
            overlay
        );


        const usernameInput =
            document.getElementById(
                "orionLoginUsername"
            );

        usernameInput.value =
            "Archit";


        document.getElementById(
            "orionLoginForm"
        ).addEventListener(
            "submit",
            handleOrionLogin
        );
    }


    const errorBox =
        document.getElementById(
            "orionLoginError"
        );


    if (errorBox) {
        errorBox.textContent =
            message || "";
    }


    overlay.style.display =
        "flex";
}


function hideOrionLogin() {

    const overlay =
        document.getElementById(
            "orionAuthOverlay"
        );


    if (overlay) {
        overlay.style.display =
            "none";
    }
}


async function handleOrionLogin(
    event
) {

    event.preventDefault();


    const username =
        document.getElementById(
            "orionLoginUsername"
        ).value.trim();


    const passwordInput =
        document.getElementById(
            "orionLoginPassword"
        );


    const password =
        passwordInput.value;


    const button =
        document.getElementById(
            "orionLoginButton"
        );


    const errorBox =
        document.getElementById(
            "orionLoginError"
        );


    button.disabled = true;
    button.textContent =
        "Authenticating...";

    errorBox.textContent = "";


    try {

        const response =
            await fetch(
                "/api/auth/login",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        username,
                        password
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail
                || "Login failed"
            );
        }


        orionAuthToken =
            data.access_token;


        sessionStorage.setItem(
            "orion_access_token",
            orionAuthToken
        );


        orionCurrentUser =
            data.user;


        passwordInput.value = "";


        hideOrionLogin();


        /*
         * Reload once after login so every
         * dashboard API request starts with
         * the JWT already available.
         */
        window.location.reload();

    }

    catch (error) {

        errorBox.textContent =
            error.message
            || "Authentication failed";

        passwordInput.value = "";

    }

    finally {

        button.disabled = false;

        button.textContent =
            "Sign in to ORION";
    }
}


async function requireOrionSession() {

    if (!orionAuthToken) {

        showOrionLogin();

        return false;
    }


    try {

        const user =
            await api(
                "/api/auth/me"
            );


        orionCurrentUser =
            user;


        hideOrionLogin();

        renderOrionAuthBadge(
            user
        );

        startOrionRoleObserver();
        applyOrionRoleUI();

        return true;

    }

    catch (error) {

        clearOrionSession();

        showOrionLogin(
            "Please sign in to continue."
        );


        return false;
    }
}


function renderOrionAuthBadge(
    user
) {

    let badge =
        document.getElementById(
            "orionAuthBadge"
        );


    if (!badge) {

        badge =
            document.createElement(
                "div"
            );

        badge.id =
            "orionAuthBadge";

        badge.className =
            "orion-auth-badge";


        const identity =
            document.createElement(
                "div"
            );

        identity.className =
            "orion-auth-identity";


        const username =
            document.createElement(
                "strong"
            );

        username.id =
            "orionAuthUsername";


        const role =
            document.createElement(
                "span"
            );

        role.id =
            "orionAuthRole";


        identity.appendChild(
            username
        );

        identity.appendChild(
            role
        );


        const logout =
            document.createElement(
                "button"
            );

        logout.textContent =
            "Logout";

        logout.onclick =
            logoutOrion;


        badge.appendChild(
            identity
        );

        badge.appendChild(
            logout
        );


        document.body.appendChild(
            badge
        );
    }


    document.getElementById(
        "orionAuthUsername"
    ).textContent =
        user.username || "User";


    document.getElementById(
        "orionAuthRole"
    ).textContent =
        String(
            user.role || "viewer"
        ).toUpperCase();
}


function logoutOrion() {

    clearOrionSession();

    const badge =
        document.getElementById(
            "orionAuthBadge"
        );


    if (badge) {
        badge.remove();
    }


    showOrionLogin(
        "You have signed out."
    );
}



// ============================================================
// ORION ROLE-AWARE UI V1
// ============================================================

function getOrionRole() {

    return String(
        orionCurrentUser?.role || "viewer"
    ).toLowerCase();
}


function orionCanOperate() {

    return [
        "operator",
        "admin"
    ].includes(
        getOrionRole()
    );
}


function orionIsAdmin() {

    return (
        getOrionRole()
        === "admin"
    );
}


function applyOrionRoleUI() {

    const role =
        getOrionRole();

    const isAdmin =
        role === "admin";

    const canOperate =
        role === "admin"
        || role === "operator";


    /*
     * SECURITY + SETTINGS:
     * admin only
     */
    document
        .querySelectorAll(
            ".nav-btn"
        )
        .forEach(button => {

            const onclick =
                button.getAttribute(
                    "onclick"
                ) || "";

            const adminSection =
                onclick.includes(
                    "'security'"
                )
                ||
                onclick.includes(
                    '"security"'
                )
                ||
                onclick.includes(
                    "'settings'"
                )
                ||
                onclick.includes(
                    '"settings"'
                );

            if (adminSection) {

                button.style.display =
                    isAdmin
                        ? ""
                        : "none";
            }
        });


    /*
     * Hide complete restricted sections.
     */
    for (
        const sectionId
        of ["security", "settings"]
    ) {

        const section =
            document.getElementById(
                sectionId
            );

        if (section) {

            section.style.display =
                isAdmin
                    ? ""
                    : "none";
        }
    }


    /*
     * Examine all action buttons.
     */
    document
        .querySelectorAll(
            "button"
        )
        .forEach(button => {

            const onclick =
                button.getAttribute(
                    "onclick"
                ) || "";


            const operatorAction =
                onclick.includes(
                    "runTask("
                )
                ||
                onclick.includes(
                    "runDeployment("
                );


            const adminAction =
                /createProject\(|deleteProject\(|createAgent\(|deleteAgent\(|createTask\(|deleteTask\(|createDeployment\(|deleteDeployment\(|createSecurityFinding\(|deleteSecurityFinding\(|createSetting\(|deleteSetting\(/.test(
                    onclick
                );


            if (operatorAction) {

                button.style.display =
                    canOperate
                        ? ""
                        : "none";
            }


            if (adminAction) {

                button.style.display =
                    isAdmin
                        ? ""
                        : "none";


                /*
                 * Hide creation form card
                 * rather than leaving empty inputs.
                 */
                if (
                    onclick.startsWith(
                        "create"
                    )
                ) {

                    const card =
                        button.closest(
                            ".card"
                        );

                    if (card) {

                        card.style.display =
                            isAdmin
                                ? ""
                                : "none";
                    }
                }
            }
        });
}


let orionRoleObserverStarted =
    false;


function startOrionRoleObserver() {

    if (
        orionRoleObserverStarted
    ) {
        return;
    }


    const observer =
        new MutationObserver(
            () => {
                applyOrionRoleUI();
            }
        );


    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );


    orionRoleObserverStarted =
        true;
}


async function startOrion() {
    console.log("Starting ORION frontend");

    const authenticated =
        await requireOrionSession();

    if (!authenticated) {
        console.log(
            "ORION waiting for authentication"
        );
        return;
    }

    try {
        await loadMonitoring();
        await loadProjects();
        await loadAgents();
        await loadTasks();
        await loadDeployments();
        await loadSecurity();
        await loadSettings();

        console.log("ORION READY");
    } catch (error) {
        console.error("ORION ERROR:", error);
    }
}

startOrion();

setInterval(() => {
    loadMonitoring().catch(console.error);
}, 5000);


// ==========================================
// ORION DASHBOARD V2
// ==========================================


function escapeOrionHTML(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}



async function loadDashboardProjects() {

    const container =
        document.getElementById("dashboardProjects");

    if (!container) return;


    try {

        const response =
            await fetch("/api/projects");

        if (!response.ok) {
            throw new Error("Projects API failed");
        }

        const projects =
            await response.json();


        if (!projects.length) {

            container.innerHTML =
                '<div class="dash-empty">No projects yet</div>';

            return;
        }


        container.innerHTML = "";


        projects
            .slice(0, 5)
            .forEach(project => {

                const progress =
                    Math.min(
                        100,
                        Math.max(
                            0,
                            Number(project.progress || 0)
                        )
                    );


                container.innerHTML += `

                    <div class="dash-list-item">

                        <div class="dash-item-main">

                            <strong>
                                ${escapeOrionHTML(project.name)}
                            </strong>

                            <small>
                                ${progress}% complete
                            </small>

                            <div class="project-progress">
                                <span style="width:${progress}%"></span>
                            </div>

                        </div>

                        <span class="dash-status">
                            ${escapeOrionHTML(project.status || "unknown")}
                        </span>

                    </div>

                `;

            });


    } catch (error) {

        console.error(
            "Dashboard projects error:",
            error
        );

        container.innerHTML =
            '<div class="dash-empty">Unable to load projects</div>';

    }

}



async function loadDashboardAgents() {

    const container =
        document.getElementById("dashboardAgents");

    if (!container) return;


    try {

        const response =
            await fetch("/api/agents");


        if (!response.ok) {
            throw new Error("Agents API failed");
        }


        const agents =
            await response.json();


        if (!agents.length) {

            container.innerHTML =
                '<div class="dash-empty">No AI employees yet</div>';

            return;
        }


        container.innerHTML = "";


        agents
            .slice(0, 6)
            .forEach(agent => {

                container.innerHTML += `

                    <div class="dash-list-item">

                        <div class="dash-item-main">

                            <strong>
                                ${escapeOrionHTML(agent.name)}
                            </strong>

                            <small>
                                ${escapeOrionHTML(agent.role || "AI Employee")}
                            </small>

                        </div>

                        <span class="dash-status dash-agent-status">
                            ${escapeOrionHTML(agent.status || "offline")}
                        </span>

                    </div>

                `;

            });


    } catch (error) {

        console.error(
            "Dashboard agents error:",
            error
        );

        container.innerHTML =
            '<div class="dash-empty">Unable to load employees</div>';

    }

}



async function loadDashboardTasks() {

    try {

        const response =
            await fetch("/api/tasks");


        if (!response.ok) {
            throw new Error("Tasks API failed");
        }


        const tasks =
            await response.json();


        let todo = 0;
        let progress = 0;
        let completed = 0;
        let blocked = 0;


        tasks.forEach(task => {

            const status =
                String(task.status || "")
                    .toLowerCase()
                    .trim();


            if (
                status === "todo" ||
                status === "to_do" ||
                status === "pending"
            ) {

                todo++;

            }
            else if (
                status === "in_progress" ||
                status === "in progress" ||
                status === "working"
            ) {

                progress++;

            }
            else if (
                status === "completed" ||
                status === "complete" ||
                status === "done"
            ) {

                completed++;

            }
            else if (
                status === "blocked" ||
                status === "failed"
            ) {

                blocked++;

            }
            else {

                todo++;

            }

        });


        const totalEl =
            document.getElementById("dashTaskTotal");

        const todoEl =
            document.getElementById("dashTodo");

        const progressEl =
            document.getElementById("dashProgress");

        const completedEl =
            document.getElementById("dashCompleted");

        const blockedEl =
            document.getElementById("dashBlocked");


        if (totalEl)
            totalEl.textContent = tasks.length;

        if (todoEl)
            todoEl.textContent = todo;

        if (progressEl)
            progressEl.textContent = progress;

        if (completedEl)
            completedEl.textContent = completed;

        if (blockedEl)
            blockedEl.textContent = blocked;


    } catch (error) {

        console.error(
            "Dashboard tasks error:",
            error
        );

    }

}



async function loadDashboardInfrastructure() {

    try {

        const response =
            await fetch(
                "/api/monitoring/system"
            );


        if (!response.ok) {
            throw new Error(
                "Monitoring API failed"
            );
        }


        const data =
            await response.json();


        const hostname =
            document.getElementById(
                "dashHostname"
            );


        if (
            hostname &&
            data.system &&
            data.system.hostname
        ) {

            hostname.textContent =
                data.system.hostname;


            // ORION V1.0 LIVE SYSTEM METRICS

            let metrics =
                document.getElementById(
                    "dashSystemMetrics"
                );


            if (!metrics) {

                metrics =
                    document.createElement(
                        "div"
                    );

                metrics.id =
                    "dashSystemMetrics";

                metrics.className =
                    "dash-system-metrics";


                const parent =
                    hostname.parentElement;

                if (parent) {
                    parent.appendChild(metrics);
                }
            }


            if (metrics) {

                const cpu =
                    data.cpu || {};

                const memory =
                    data.memory || {};

                const disk =
                    data.disk || {};


                const cpuValue =
                    cpu.usage_percent ??
                    cpu.percent ??
                    data.cpu_percent ??
                    "-";


                const memoryValue =
                    memory.usage_percent ??
                    memory.percent ??
                    data.memory_percent ??
                    "-";


                const diskValue =
                    disk.usage_percent ??
                    disk.percent ??
                    data.disk_percent ??
                    "-";


                metrics.innerHTML = `

                    <div class="dash-system-stat">
                        <span>CPU</span>
                        <strong>
                            ${cpuValue}${cpuValue !== "-" ? "%" : ""}
                        </strong>
                    </div>

                    <div class="dash-system-stat">
                        <span>RAM</span>
                        <strong>
                            ${memoryValue}${memoryValue !== "-" ? "%" : ""}
                        </strong>
                    </div>

                    <div class="dash-system-stat">
                        <span>DISK</span>
                        <strong>
                            ${diskValue}${diskValue !== "-" ? "%" : ""}
                        </strong>
                    </div>

                `;
            }

        }


    } catch (error) {

        console.error(
            "Infrastructure dashboard error:",
            error
        );

    }

}



async function loadDashboardActivity() {

    const container =
        document.getElementById(
            "recentActivity"
        );

    if (!container) return;


    try {

        const [
            projectsResponse,
            agentsResponse,
            tasksResponse,
            deploymentsResponse
        ] = await Promise.all([

            fetch("/api/projects"),

            fetch("/api/agents"),

            fetch("/api/tasks"),

            fetch("/api/deployments")

        ]);


        const projects =
            projectsResponse.ok
                ? await projectsResponse.json()
                : [];


        const agents =
            agentsResponse.ok
                ? await agentsResponse.json()
                : [];


        const tasks =
            tasksResponse.ok
                ? await tasksResponse.json()
                : [];


        const deployments =
            deploymentsResponse.ok
                ? await deploymentsResponse.json()
                : [];


        const activeProjects =
            projects.filter(project =>
                String(
                    project.status || ""
                ).toLowerCase() === "active"
            ).length;


        const onlineAgents =
            agents.filter(agent =>
                String(
                    agent.status || ""
                ).toLowerCase() === "online"
            ).length;


        const completedTasks =
            tasks.filter(task =>
                [
                    "completed",
                    "complete",
                    "done"
                ].includes(
                    String(
                        task.status || ""
                    ).toLowerCase()
                )
            ).length;


        const successfulDeployments =
            deployments.filter(deployment =>
                [
                    "success",
                    "successful",
                    "completed"
                ].includes(
                    String(
                        deployment.status || ""
                    ).toLowerCase()
                )
            ).length;


        const blockedTasks =
            tasks.filter(task =>
                [
                    "blocked",
                    "failed"
                ].includes(
                    String(
                        task.status || ""
                    ).toLowerCase()
                )
            ).length;


        container.innerHTML = `

            <div class="orion-kpi-strip">

                <div class="orion-kpi-mini">
                    <span>ACTIVE PROJECTS</span>
                    <strong>${activeProjects}</strong>
                    <small>${projects.length} total projects</small>
                </div>

                <div class="orion-kpi-mini">
                    <span>AI EMPLOYEES</span>
                    <strong>${onlineAgents}</strong>
                    <small>${agents.length} registered</small>
                </div>

                <div class="orion-kpi-mini">
                    <span>COMPLETED TASKS</span>
                    <strong>${completedTasks}</strong>
                    <small>${tasks.length} total tasks</small>
                </div>

                <div class="orion-kpi-mini">
                    <span>DEPLOYMENTS</span>
                    <strong>${successfulDeployments}</strong>
                    <small>successful releases</small>
                </div>

            </div>


            <div class="activity-entry">

                <span class="activity-status green-activity"></span>

                <div>
                    <strong>ORION API operational</strong>
                    <small>
                        Backend and dashboard services responding
                    </small>
                </div>

                <span>Live</span>

            </div>


            <div class="activity-entry">

                <span class="activity-status green-activity"></span>

                <div>
                    <strong>
                        ${activeProjects} active projects
                    </strong>

                    <small>
                        ${projects.length} projects registered
                    </small>
                </div>

                <span>Live</span>

            </div>


            <div class="activity-entry">

                <span class="activity-status green-activity"></span>

                <div>
                    <strong>
                        ${onlineAgents} AI employees online
                    </strong>

                    <small>
                        Digital workforce available
                    </small>
                </div>

                <span>Live</span>

            </div>


            <div class="activity-entry">

                <span class="activity-status blue-activity"></span>

                <div>
                    <strong>
                        ${completedTasks} completed tasks
                    </strong>

                    <small>
                        ${blockedTasks} blocked or failed
                    </small>
                </div>

                <span>Now</span>

            </div>


            <div class="activity-entry">

                <span class="activity-status green-activity"></span>

                <div>
                    <strong>
                        ${successfulDeployments}
                        successful deployments
                    </strong>

                    <small>
                        Production deployment records
                    </small>
                </div>

                <span>Now</span>

            </div>

        `;


    } catch (error) {

        console.error(
            "Dashboard activity error:",
            error
        );

        container.innerHTML =
            '<div class="dash-empty">Unable to load activity</div>';
    }

}



async function loadOrionDashboardV2() {

    await Promise.allSettled([

        loadDashboardProjects(),

        loadDashboardAgents(),

        loadDashboardTasks(),

        loadDashboardInfrastructure(),

        loadDashboardActivity()

    ]);

}



document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadOrionDashboardV2();

    }
);



setInterval(
    loadOrionDashboardV2,
    10000
);



// ==========================================================
// ORION LIVE INFRASTRUCTURE STATUS
// ==========================================================

async function loadLiveInfrastructure() {

    const panel = document.querySelector(".infrastructure-panel");

    if (!panel) return;

    try {

        const response = await fetch(
            "/api/infrastructure/health",
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                "Infrastructure API returned " + response.status
            );
        }

        const data = await response.json();
        const services = data.services || {};

        const fastapi = services.fastapi || {};
        const nginx = services.nginx || {};
        const postgres = services.postgresql || {};
        const ec2 = services.ec2 || {};


        function statusClass(status) {

            return status === "online"
                ? "service-online"
                : "service-offline";
        }


        function statusText(status) {

            return status === "online"
                ? "● Online"
                : "● Offline";
        }


        function latency(service) {

            if (
                service.latency_ms !== undefined &&
                service.latency_ms !== null
            ) {
                return `${service.latency_ms} ms`;
            }

            return "";
        }


        const overallHealthy =
            data.status === "healthy";


        const overallBadge = overallHealthy
            ? `<span class="health-badge">● All Systems Operational</span>`
            : `<span class="health-badge health-degraded">⚠ Degraded</span>`;


        panel.innerHTML = `

            <div class="panel-title">

                <div>
                    <h3>Infrastructure Status</h3>
                    <p>Real-time ORION production services</p>
                </div>

                ${overallBadge}

            </div>


            <div class="infra-list">


                <div class="infra-service">

                    <div>

                        <span class="service-icon api-icon">
                            API
                        </span>

                        <div>

                            <strong>
                                FastAPI Server
                            </strong>

                            <small>
                                ${escapeOrionHTML(
                                    fastapi.address || "127.0.0.1:9000"
                                )}
                            </small>

                        </div>

                    </div>


                    <div class="service-health-right">

                        <span class="${statusClass(fastapi.status)}">
                            ${statusText(fastapi.status)}
                        </span>

                        <small>
                            ${latency(fastapi)}
                        </small>

                    </div>

                </div>


                <div class="infra-service">

                    <div>

                        <span class="service-icon nginx-icon">
                            NX
                        </span>

                        <div>

                            <strong>
                                Nginx Proxy
                            </strong>

                            <small>
                                ${escapeOrionHTML(
                                    nginx.address || "127.0.0.1:80"
                                )}
                            </small>

                        </div>

                    </div>


                    <div class="service-health-right">

                        <span class="${statusClass(nginx.status)}">
                            ${statusText(nginx.status)}
                        </span>

                        <small>
                            ${latency(nginx)}
                        </small>

                    </div>

                </div>


                <div class="infra-service">

                    <div>

                        <span class="service-icon db-icon">
                            DB
                        </span>

                        <div>

                            <strong>
                                PostgreSQL
                            </strong>

                            <small>
                                ${escapeOrionHTML(
                                    postgres.database || "orion_db"
                                )}
                            </small>

                        </div>

                    </div>


                    <div class="service-health-right">

                        <span class="${statusClass(postgres.status)}">
                            ${statusText(postgres.status)}
                        </span>

                        <small>
                            ${latency(postgres)}
                        </small>

                    </div>

                </div>


                <div class="infra-service">

                    <div>

                        <span class="service-icon ec2-icon">
                            AWS
                        </span>

                        <div>

                            <strong>
                                Amazon EC2
                            </strong>

                            <small>
                                ${escapeOrionHTML(
                                    ec2.hostname || "Unknown host"
                                )}
                            </small>

                        </div>

                    </div>


                    <div class="service-health-right">

                        <span class="${statusClass(ec2.status)}">
                            ${statusText(ec2.status)}
                        </span>

                    </div>

                </div>


            </div>

        `;


    } catch (error) {

        console.error(
            "Infrastructure health error:",
            error
        );


        panel.innerHTML = `

            <div class="panel-title">

                <div>
                    <h3>Infrastructure Status</h3>
                    <p>Unable to reach health service</p>
                </div>

                <span class="health-badge health-degraded">
                    ⚠ Health Check Failed
                </span>

            </div>

            <div class="infra-error">

                ORION could not retrieve infrastructure health.

            </div>

        `;

    }

}


document.addEventListener(
    "DOMContentLoaded",
    loadLiveInfrastructure
);


setInterval(
    loadLiveInfrastructure,
    10000
);


// ==========================================================
// ORION RUN TASK BROWSER ENGINE
// ==========================================================

async function runTask(id, button) {

    const resultRow =
        document.getElementById(
            `task-result-row-${id}`
        );

    const resultBox =
        document.getElementById(
            `task-result-${id}`
        );


    if (!resultRow || !resultBox) {

        console.error(
            "Task result container not found"
        );

        return;
    }


    // ------------------------------------------------------
    // SHOW EXECUTING STATE
    // ------------------------------------------------------

    resultRow.style.display =
        "table-row";


    button.disabled = true;

    button.innerHTML =
        '<span class="run-spinner"></span> Executing';


    resultBox.innerHTML = `

        <div class="task-running">

            <div class="task-running-top">

                <span class="large-spinner"></span>

                <div>

                    <strong>
                        ORION EXECUTION ENGINE
                    </strong>

                    <p>
                        Executing Task ${id}...
                    </p>

                </div>

            </div>

            <div class="execution-progress">

                <div class="execution-progress-bar">
                </div>

            </div>

        </div>

    `;


    try {

        // --------------------------------------------------
        // CALL REAL BACKEND EXECUTOR
        // --------------------------------------------------

        const response =
            await fetch(
                `/api/tasks/${id}/run`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        ...(orionAuthToken
                            ? {
                                "Authorization":
                                    `Bearer ${orionAuthToken}`
                              }
                            : {})
                    },

                    cache: "no-store"
                }
            );


        let data;


        try {

            data = await response.json();

        }

        catch {

            throw new Error(
                "ORION returned an invalid response"
            );

        }


        if (!response.ok) {

            throw new Error(
                data.detail ||
                `Execution failed (${response.status})`
            );

        }


        // ==================================================
        // SUCCESS
        // ==================================================

        if (
            (data.message || "").toLowerCase() === "task completed"
            &&
            (data.result?.health || "").toLowerCase() !== "blocked"
        ) {

            const result =
                data.result || {};


            const cpu =
                result.cpu || {};


            const memory =
                result.memory || {};


            const disk =
                result.disk || {};


            const uptime =
                result.uptime || {};


            const system =
                result.system || {};


            const warnings =
                Array.isArray(result.warnings)
                    ? result.warnings
                    : [];


            const recommendations =
                Array.isArray(
                    result.recommendations
                )
                    ? result.recommendations
                    : [];


            const health =
                result.health || "completed";


            const healthClass =
                health === "healthy"
                    ? "health-good"
                    : "health-warning";


            resultBox.innerHTML = `

                <div class="execution-report">


                    <!-- HEADER -->

                    <div class="execution-header">

                        <div>

                            <strong class="execution-success-title">

                                ✓ TASK COMPLETED

                            </strong>

                            <small>

                                ${escapeOrionHTML(
                                    result.execution ||
                                    "ORION Task Execution"
                                )}

                            </small>

                        </div>


                        <span
                            class="execution-health ${healthClass}"
                        >

                            ● ${escapeOrionHTML(
                                health.toUpperCase()
                            )}

                        </span>

                    </div>



                    <!-- METRICS -->

                    <div class="execution-grid">


                        <div class="execution-metric">

                            <span>
                                CPU
                            </span>

                            <strong>
                                ${
                                    cpu.usage_percent ??
                                    "-"
                                }%
                            </strong>

                            <small>
                                ${
                                    cpu.cores ??
                                    "-"
                                } logical cores
                            </small>

                        </div>



                        <div class="execution-metric">

                            <span>
                                MEMORY
                            </span>

                            <strong>
                                ${
                                    memory.usage_percent ??
                                    "-"
                                }%
                            </strong>

                            <small>
                                ${
                                    memory.used_gb ??
                                    "-"
                                } GB used
                            </small>

                        </div>



                        <div class="execution-metric">

                            <span>
                                DISK
                            </span>

                            <strong>
                                ${
                                    disk.usage_percent ??
                                    "-"
                                }%
                            </strong>

                            <small>
                                ${
                                    disk.free_gb ??
                                    "-"
                                } GB free
                            </small>

                        </div>



                        <div class="execution-metric">

                            <span>
                                UPTIME
                            </span>

                            <strong class="uptime-value">

                                ${escapeOrionHTML(
                                    uptime.formatted ||
                                    "-"
                                )}

                            </strong>

                            <small>
                                Server uptime
                            </small>

                        </div>

                    </div>



                    <!-- SERVER INFORMATION -->

                    <div class="execution-server">

                        <div>

                            <span>
                                HOSTNAME
                            </span>

                            <strong>
                                ${escapeOrionHTML(
                                    system.hostname ||
                                    "Unknown"
                                )}
                            </strong>

                        </div>


                        <div>

                            <span>
                                PLATFORM
                            </span>

                            <strong>
                                ${escapeOrionHTML(
                                    system.platform ||
                                    "Linux"
                                )}
                            </strong>

                        </div>


                        <div>

                            <span>
                                ARCHITECTURE
                            </span>

                            <strong>
                                ${escapeOrionHTML(
                                    system.architecture ||
                                    "-"
                                )}
                            </strong>

                        </div>

                    </div>



                    <!-- ANALYSIS -->

                    <div class="execution-details">


                        <div class="execution-analysis-card">

                            <strong>
                                ⚠ Health Analysis
                            </strong>

                            <p>

                                ${
                                    warnings.length
                                        ?
                                        warnings
                                        .map(
                                            item =>
                                            escapeOrionHTML(
                                                item
                                            )
                                        )
                                        .join("<br>")
                                        :
                                        "No warnings detected. System resources are within normal limits."
                                }

                            </p>

                        </div>



                        <div class="execution-analysis-card">

                            <strong>
                                ✦ ORION Recommendation
                            </strong>

                            <p>

                                ${
                                    recommendations.length
                                        ?
                                        recommendations
                                        .map(
                                            item =>
                                            escapeOrionHTML(
                                                item
                                            )
                                        )
                                        .join("<br>")
                                        :
                                        "No immediate action required."
                                }

                            </p>

                        </div>


                    </div>


                    <div class="execution-footer">

                        <span>
                            Execution completed by ORION
                        </span>

                        <span>
                            Task ID #${id}
                        </span>

                    </div>


                </div>

            `;

        }


        // ==================================================
        // UNSUPPORTED TASK
        // ==================================================

        else {

            resultBox.innerHTML = `

                <div class="execution-blocked">

                    <div class="blocked-icon">
                        !
                    </div>

                    <div>

                        <strong>
                            TASK BLOCKED
                        </strong>

                        <p>
                            ${escapeOrionHTML(
                                data.message ||
                                "ORION does not have an approved executor for this task."
                            )}
                        </p>

                    </div>

                </div>

            `;

        }


        // --------------------------------------------------
        // REFRESH DASHBOARD COUNTERS
        // --------------------------------------------------

        if (
            typeof loadDashboardTasks ===
            "function"
        ) {

            await loadDashboardTasks();

        }


        if (
            typeof loadDashboardActivity ===
            "function"
        ) {

            await loadDashboardActivity();

        }


        if (
            typeof loadDashboardAgents ===
            "function"
        ) {

            await loadDashboardAgents();

        }


        // --------------------------------------------------
        // UPDATE BUTTON WITHOUT REBUILDING TABLE
        // This keeps the execution report visible.
        // --------------------------------------------------

        button.disabled = false;


        if (data.status === "success") {

            button.textContent =
                "↻ Run Again";

        }

        else {

            button.textContent =
                "▶ Run Task";

        }


    }

    catch (error) {

        console.error(
            "ORION task execution error:",
            error
        );


        resultBox.innerHTML = `

            <div class="execution-error">

                <div class="error-icon">
                    ×
                </div>

                <div>

                    <strong>
                        EXECUTION FAILED
                    </strong>

                    <p>
                        ${escapeOrionHTML(
                            error.message
                        )}
                    </p>

                </div>

            </div>

        `;


        button.disabled = false;

        button.textContent =
            "▶ Run Task";

    }

}



// ==========================================================
// ORION EXECUTION REPORT VIEWER
// ==========================================================


async function viewTaskReport(taskId) {

    const modal =
        document.getElementById(
            "executionReportModal"
        );

    const content =
        document.getElementById(
            "executionReportContent"
        );


    if (!modal || !content) {

        alert(
            "Execution report window is missing."
        );

        return;
    }


    modal.classList.add(
        "show"
    );


    document.body.classList.add(
        "report-modal-open"
    );


    content.innerHTML = `

        <div class="report-loading">

            <div class="report-spinner"></div>

            <strong>
                Loading ORION execution report...
            </strong>

        </div>

    `;


    try {

        const response =
            await fetch(
                `/api/tasks/${taskId}/executions`,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `Report API returned ${response.status}`
            );

        }


        const executions =
            await response.json();


        if (
            !Array.isArray(executions)
            ||
            executions.length === 0
        ) {

            content.innerHTML = `

                <div class="report-empty">

                    <div class="report-empty-icon">
                        📄
                    </div>

                    <h3>
                        No Execution Report Yet
                    </h3>

                    <p>
                        Task #${taskId} has no saved execution history.
                    </p>

                    <p>
                        Run this task first to generate a permanent ORION report.
                    </p>

                </div>

            `;

            return;
        }


        // Latest execution first
        const latest =
            executions[0];


        renderExecutionReport(
            latest,
            executions
        );


    }

    catch (error) {

        console.error(
            "Execution report error:",
            error
        );


        content.innerHTML = `

            <div class="report-error">

                <strong>
                    ✕ REPORT LOAD FAILED
                </strong>

                <p>
                    ${escapeOrionHTML(
                        error.message
                    )}
                </p>

            </div>

        `;

    }

}




// ============================================================
// ORION EXECUTOR-AWARE REPORT METRICS V1
// ============================================================

function renderExecutionMetricCards(execution) {

    let result =
        execution?.result ||
        execution?.result_json ||
        {};

    if (typeof result === "string") {
        try {
            result = JSON.parse(result);
        } catch (error) {
            result = {};
        }
    }

    if (!result || typeof result !== "object") {
        result = {};
    }


    const executor = (
        execution?.executor ||
        result?.executor ||
        ""
    ).toLowerCase();


    const card = (
        label,
        value,
        description
    ) => `
        <div class="report-metric-card">

            <span>
                ${escapeOrionHTML(
                    String(label ?? "-")
                )}
            </span>

            <strong>
                ${escapeOrionHTML(
                    String(value ?? "-")
                )}
            </strong>

            <small>
                ${escapeOrionHTML(
                    String(description ?? "")
                )}
            </small>

        </div>
    `;


    const stateText = (
        value,
        goodText,
        badText
    ) => {

        if (value === true) {
            return goodText;
        }

        if (value === false) {
            return badText;
        }

        return "-";
    };


    // ========================================================
    // NGINX HEALTH
    // ========================================================

    if (executor === "nginx_health") {

        const nginx = result.nginx || {};

        return [

            card(
                "SERVICE",
                stateText(
                    nginx.service_active,
                    "ACTIVE",
                    "INACTIVE"
                ),
                "Nginx service"
            ),

            card(
                "CONFIG",
                stateText(
                    nginx.config_valid,
                    "VALID",
                    "INVALID"
                ),
                "Configuration validation"
            ),

            card(
                "PORT 80",
                stateText(
                    nginx.port_80_open,
                    "OPEN",
                    "CLOSED"
                ),
                "HTTP listener"
            ),

            card(
                "LATENCY",
                nginx.latency_ms != null
                    ? `${nginx.latency_ms} ms`
                    : "-",
                "Local response time"
            )

        ].join("");
    }


    // ========================================================
    // POSTGRESQL HEALTH
    // ========================================================

    if (executor === "postgres_health") {

        const database = result.database || {};

        let postgresVersion = "-";

        if (database.version) {

            const versionMatch = String(
                database.version
            ).match(
                /PostgreSQL\s+([0-9.]+)/i
            );

            postgresVersion = versionMatch
                ? versionMatch[1]
                : String(database.version);
        }


        return [

            card(
                "SERVICE",
                stateText(
                    database.service_active,
                    "ACTIVE",
                    "INACTIVE"
                ),
                "PostgreSQL service"
            ),

            card(
                "DATABASE",
                stateText(
                    database.connection_ok,
                    "CONNECTED",
                    "FAILED"
                ),
                "SQL connectivity"
            ),

            card(
                "LATENCY",
                database.latency_ms != null
                    ? `${database.latency_ms} ms`
                    : "-",
                "Database response time"
            ),

            card(
                "VERSION",
                postgresVersion,
                "PostgreSQL engine"
            )

        ].join("");
    }


    // ========================================================
    // ORION API HEALTH
    // ========================================================

    if (executor === "api_health") {

        const api = result.api || {};

        const health = (
            execution?.health ||
            result?.health ||
            "-"
        ).toUpperCase();


        return [

            card(
                "API SERVICE",
                stateText(
                    api.service_active,
                    "ACTIVE",
                    "INACTIVE"
                ),
                "FastAPI backend"
            ),

            card(
                "PORT 9000",
                stateText(
                    api.port_9000_open,
                    "OPEN",
                    "CLOSED"
                ),
                "Internal API listener"
            ),

            card(
                "LATENCY",
                api.latency_ms != null
                    ? `${api.latency_ms} ms`
                    : "-",
                "API response time"
            ),

            card(
                "HEALTH",
                health,
                "ORION API status"
            )

        ].join("");
    }


    // ========================================================
    // SYSTEM HEALTH / FALLBACK
    // ========================================================

    const cpu = result.cpu || {};
    const memory = result.memory || {};
    const disk = result.disk || {};


    return [

        card(
            "CPU",
            (
                execution?.cpu_percent ??
                cpu?.usage_percent
            ) != null
                ? `${
                    execution?.cpu_percent ??
                    cpu?.usage_percent
                  }%`
                : "-",
            `${cpu?.cores ?? "-"} logical cores`
        ),

        card(
            "MEMORY",
            (
                execution?.memory_percent ??
                memory?.usage_percent
            ) != null
                ? `${
                    execution?.memory_percent ??
                    memory?.usage_percent
                  }%`
                : "-",
            memory?.used_gb != null
                ? `${memory.used_gb} GB used`
                : "Memory usage"
        ),

        card(
            "DISK",
            (
                execution?.disk_percent ??
                disk?.usage_percent
            ) != null
                ? `${
                    execution?.disk_percent ??
                    disk?.usage_percent
                  }%`
                : "-",
            disk?.free_gb != null
                ? `${disk.free_gb} GB free`
                : "Disk usage"
        ),

        card(
            "DURATION",
            execution?.duration_ms != null
                ? execution.duration_ms
                : "-",
            "milliseconds"
        )

    ].join("");
}


function renderExecutionReport(
    execution,
    history
) {

    const content =
        document.getElementById(
            "executionReportContent"
        );


    if (!content) return;


    const result =
        execution.result || {};


    const system =
        result.system || {};


    const cpu =
        result.cpu || {};


    const memory =
        result.memory || {};


    const disk =
        result.disk || {};


    const uptime =
        result.uptime || {};


    const warnings =
        Array.isArray(
            execution.warnings
        )
            ? execution.warnings
            : [];


    const recommendations =
        Array.isArray(
            execution.recommendations
        )
            ? execution.recommendations
            : [];


    const status =
        execution.status ||
        "unknown";


    const health =
        execution.health ||
        "unknown";


    const statusClass =
        status === "success"
            ? "report-status-success"
            :
        status === "failed"
            ? "report-status-failed"
            :
        status === "unsupported"
            ? "report-status-warning"
            :
            "report-status-neutral";


    const healthClass =
        health === "healthy"
            ? "report-health-good"
            :
        health === "warning"
            ? "report-health-warning"
            :
            "report-health-bad";


    const started =
        formatOrionDate(
            execution.started_at
        );


    const completed =
        formatOrionDate(
            execution.completed_at
        );


    const historyHtml =
        history
        .slice(0, 8)
        .map(item => {

            const itemStatus =
                item.status === "success"
                    ? "✓"
                    :
                item.status === "failed"
                    ? "✕"
                    :
                    "!";


            return `

                <button
                    class="report-history-item"
                    onclick="loadExecutionById(${item.id})"
                >

                    <span class="history-id">
                        #${item.id}
                    </span>

                    <span class="history-title">
                        ${escapeOrionHTML(
                            item.task_title ||
                            "Task Execution"
                        )}
                    </span>

                    <span class="history-status">
                        ${itemStatus}
                        ${escapeOrionHTML(
                            item.status ||
                            "unknown"
                        )}
                    </span>

                    <span class="history-duration">
                        ${
                            item.duration_ms ??
                            "-"
                        } ms
                    </span>

                </button>

            `;

        })
        .join("");


    content.innerHTML = `

        <div class="report-main-header">

            <div>

                <span class="report-execution-id">
                    EXECUTION #${execution.id}
                </span>

                <h3>
                    ${escapeOrionHTML(
                        execution.task_title ||
                        "Task Execution"
                    )}
                </h3>

                <p>
                    Executed by
                    <strong>
                        ${escapeOrionHTML(
                            execution.agent_name ||
                            "ORION System"
                        )}
                    </strong>
                </p>

            </div>


            <div class="report-badges">

                <span class="report-status ${statusClass}">
                    ${escapeOrionHTML(
                        status.toUpperCase()
                    )}
                </span>

                <span class="report-health ${healthClass}">
                    ● ${escapeOrionHTML(
                        health.toUpperCase()
                    )}
                </span>

            </div>

        </div>


        <div class="report-metric-grid">

            ${renderExecutionMetricCards(
                execution
            )}

        </div>


        <div class="report-section">

            <div class="report-section-title">

                <span>
                    SERVER INFORMATION
                </span>

            </div>


            <div class="report-info-grid">


                <div class="report-info-item">

                    <span>
                        Hostname
                    </span>

                    <strong>
                        ${escapeOrionHTML(
                            execution.hostname ||
                            system.hostname ||
                            "-"
                        )}
                    </strong>

                </div>


                <div class="report-info-item">

                    <span>
                        Platform
                    </span>

                    <strong>
                        ${escapeOrionHTML(
                            system.platform ||
                            "-"
                        )}
                    </strong>

                </div>


                <div class="report-info-item">

                    <span>
                        Kernel
                    </span>

                    <strong>
                        ${escapeOrionHTML(
                            system.platform_release ||
                            "-"
                        )}
                    </strong>

                </div>


                <div class="report-info-item">

                    <span>
                        Architecture
                    </span>

                    <strong>
                        ${escapeOrionHTML(
                            system.architecture ||
                            "-"
                        )}
                    </strong>

                </div>


                <div class="report-info-item">

                    <span>
                        Python
                    </span>

                    <strong>
                        ${escapeOrionHTML(
                            system.python_version ||
                            "-"
                        )}
                    </strong>

                </div>


                <div class="report-info-item">

                    <span>
                        Uptime
                    </span>

                    <strong>
                        ${escapeOrionHTML(
                            uptime.formatted ||
                            "-"
                        )}
                    </strong>

                </div>


            </div>

        </div>


        <div class="report-analysis-grid">


            <div class="report-analysis-card">

                <div class="report-analysis-title">
                    ⚠ Health Analysis
                </div>

                <div class="report-analysis-body">

                    ${
                        warnings.length
                            ?
                            warnings
                            .map(
                                warning =>
                                `<p>• ${escapeOrionHTML(
                                    warning
                                )}</p>`
                            )
                            .join("")
                            :
                            `
                            <p class="report-good-text">
                                ✓ No warnings detected.
                            </p>

                            <p>
                                System resources were within acceptable limits.
                            </p>
                            `
                    }

                </div>

            </div>


            <div class="report-analysis-card">

                <div class="report-analysis-title">
                    ✦ ORION Recommendation
                </div>

                <div class="report-analysis-body">

                    ${
                        recommendations.length
                            ?
                            recommendations
                            .map(
                                recommendation =>
                                `<p>• ${escapeOrionHTML(
                                    recommendation
                                )}</p>`
                            )
                            .join("")
                            :
                            `
                            <p>
                                No recommendations available.
                            </p>
                            `
                    }

                </div>

            </div>


        </div>


        <div class="report-section">

            <div class="report-section-title">
                EXECUTION DETAILS
            </div>


            <div class="report-detail-table">


                <div>
                    <span>Execution ID</span>
                    <strong>#${execution.id}</strong>
                </div>


                <div>
                    <span>Task ID</span>
                    <strong>#${execution.task_id}</strong>
                </div>


                <div>
                    <span>Executor</span>
                    <strong>
                        ${escapeOrionHTML(
                            execution.executor ||
                            "-"
                        )}
                    </strong>
                </div>


                <div>
                    <span>Started</span>
                    <strong>
                        ${escapeOrionHTML(
                            started
                        )}
                    </strong>
                </div>


                <div>
                    <span>Completed</span>
                    <strong>
                        ${escapeOrionHTML(
                            completed
                        )}
                    </strong>
                </div>


                <div>
                    <span>Duration</span>
                    <strong>
                        ${
                            execution.duration_ms ??
                            "-"
                        } ms
                    </strong>
                </div>


            </div>

        </div>


        <div class="report-section">

            <div class="report-section-title">
                RECENT EXECUTIONS
            </div>

            <div class="report-history-list">

                ${historyHtml}

            </div>

        </div>


        <div class="report-footer">

            <div>
                ORION Autonomous Company OS
            </div>

            <div>
                Persistent PostgreSQL Execution Record
            </div>

        </div>

    `;

}



async function loadExecutionById(
    executionId
) {

    const content =
        document.getElementById(
            "executionReportContent"
        );


    if (!content) return;


    content.innerHTML = `

        <div class="report-loading">

            <div class="report-spinner"></div>

            Loading Execution #${executionId}...

        </div>

    `;


    try {

        const response =
            await fetch(
                `/api/executions/${executionId}`,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "Execution report not found"
            );

        }


        const execution =
            await response.json();


        const historyResponse =
            await fetch(
                `/api/tasks/${execution.task_id}/executions`,
                {
                    cache: "no-store"
                }
            );


        const history =
            historyResponse.ok
                ? await historyResponse.json()
                : [execution];


        renderExecutionReport(
            execution,
            history
        );


    }

    catch (error) {

        content.innerHTML = `

            <div class="report-error">

                <strong>
                    ✕ REPORT LOAD FAILED
                </strong>

                <p>
                    ${escapeOrionHTML(
                        error.message
                    )}
                </p>

            </div>

        `;

    }

}



function closeExecutionReport() {

    const modal =
        document.getElementById(
            "executionReportModal"
        );


    if (modal) {

        modal.classList.remove(
            "show"
        );

    }


    document.body.classList.remove(
        "report-modal-open"
    );

}



function formatOrionDate(value) {

    if (!value) {
        return "-";
    }


    try {

        return new Date(
            value
        ).toLocaleString();

    }

    catch {

        return value;

    }

}


// ESC key closes report

document.addEventListener(
    "keydown",
    function(event) {

        if (
            event.key === "Escape"
        ) {

            closeExecutionReport();

        }

    }
);



// ==========================================================
// ORION EXECUTION HISTORY PAGE
// ==========================================================

let executionHistoryCache = [];



async function loadExecutionHistory() {

    const table =
        document.getElementById(
            "executionHistoryTable"
        );


    if (!table) {
        return;
    }


    table.innerHTML = `

        <tr>
            <td colspan="11">

                <div class="execution-history-loading">

                    <div class="report-spinner"></div>

                    Loading ORION execution history...

                </div>

            </td>
        </tr>

    `;


    try {

        const response =
            await fetch(
                "/api/executions?limit=500",
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `Execution API returned ${response.status}`
            );

        }


        const data =
            await response.json();


        executionHistoryCache =
            Array.isArray(data)
                ? data
                : [];


        updateExecutionSummary(
            executionHistoryCache
        );


        renderExecutionHistory(
            executionHistoryCache
        );


    }

    catch (error) {

        console.error(
            "Execution history error:",
            error
        );


        table.innerHTML = `

            <tr>

                <td colspan="11">

                    <div class="execution-history-error">

                        <strong>
                            ✕ EXECUTION HISTORY FAILED
                        </strong>

                        <p>
                            ${escapeOrionHTML(
                                error.message
                            )}
                        </p>

                    </div>

                </td>

            </tr>

        `;

    }

}



function updateExecutionSummary(
    executions
) {

    const total =
        executions.length;


    const success =
        executions.filter(
            item =>
                item.status === "success"
        ).length;


    const failed =
        executions.filter(
            item =>
                item.status === "failed"
        ).length;


    const durations =
        executions
        .map(
            item =>
                Number(
                    item.duration_ms
                )
        )
        .filter(
            value =>
                Number.isFinite(value)
        );


    const average =
        durations.length
            ?
            (
                durations.reduce(
                    (sum, value) =>
                        sum + value,
                    0
                )
                /
                durations.length
            )
            :
            0;


    const totalEl =
        document.getElementById(
            "executionTotal"
        );


    const successEl =
        document.getElementById(
            "executionSuccess"
        );


    const failedEl =
        document.getElementById(
            "executionFailed"
        );


    const averageEl =
        document.getElementById(
            "executionAverage"
        );


    if (totalEl) {
        totalEl.textContent = total;
    }


    if (successEl) {
        successEl.textContent = success;
    }


    if (failedEl) {
        failedEl.textContent = failed;
    }


    if (averageEl) {

        averageEl.textContent =
            `${average.toFixed(0)} ms`;

    }

}



function filterExecutionHistory() {

    const searchInput =
        document.getElementById(
            "executionSearch"
        );


    const statusInput =
        document.getElementById(
            "executionStatusFilter"
        );


    const healthInput =
        document.getElementById(
            "executionHealthFilter"
        );


    const search =
        searchInput
            ?
            searchInput.value
                .trim()
                .toLowerCase()
            :
            "";


    const status =
        statusInput
            ?
            statusInput.value
            :
            "";


    const health =
        healthInput
            ?
            healthInput.value
            :
            "";


    const filtered =
        executionHistoryCache.filter(
            execution => {

                const searchable =
                    [
                        execution.task_title,
                        execution.agent_name,
                        execution.executor,
                        execution.hostname,
                        execution.status,
                        execution.health
                    ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();


                if (
                    search
                    &&
                    !searchable.includes(search)
                ) {

                    return false;

                }


                if (
                    status
                    &&
                    execution.status !== status
                ) {

                    return false;

                }


                if (
                    health
                    &&
                    execution.health !== health
                ) {

                    return false;

                }


                return true;

            }
        );


    renderExecutionHistory(
        filtered
    );

}



function renderExecutionHistory(
    executions
) {

    const table =
        document.getElementById(
            "executionHistoryTable"
        );


    if (!table) {
        return;
    }


    if (
        !Array.isArray(executions)
        ||
        executions.length === 0
    ) {

        table.innerHTML = `

            <tr>

                <td colspan="11">

                    <div class="execution-history-empty">

                        <div>
                            📋
                        </div>

                        <strong>
                            No executions found
                        </strong>

                        <p>
                            Run an ORION task to create a permanent execution record.
                        </p>

                    </div>

                </td>

            </tr>

        `;

        return;
    }


    table.innerHTML =
        executions
        .map(
            execution => {

                const status =
                    execution.status ||
                    "unknown";


                const health =
                    execution.health ||
                    "unknown";


                const statusClass =
                    status === "success"
                        ?
                        "execution-row-success"
                        :
                    status === "failed"
                        ?
                        "execution-row-failed"
                        :
                    status === "unsupported"
                        ?
                        "execution-row-warning"
                        :
                        "execution-row-neutral";


                const healthClass =
                    health === "healthy"
                        ?
                        "execution-health-good"
                        :
                    health === "warning"
                        ?
                        "execution-health-warning"
                        :
                        "execution-health-bad";


                return `

                    <tr>

                        <td>
                            <span class="execution-id">
                                #${execution.id}
                            </span>
                        </td>


                        <td>

                            <div class="execution-task-cell">

                                <strong>
                                    ${escapeOrionHTML(
                                        execution.task_title ||
                                        "Task Execution"
                                    )}
                                </strong>

                                <small>
                                    Task #${execution.task_id}
                                </small>

                            </div>

                        </td>


                        <td>

                            <div class="execution-agent-cell">

                                ${escapeOrionHTML(
                                    execution.agent_name ||
                                    "ORION System"
                                )}

                            </div>

                        </td>


                        <td>

                            <span
                                class="execution-row-status ${statusClass}"
                            >

                                ${escapeOrionHTML(
                                    status.toUpperCase()
                                )}

                            </span>

                        </td>


                        <td>

                            <span
                                class="execution-row-health ${healthClass}"
                            >

                                ● ${escapeOrionHTML(
                                    health.toUpperCase()
                                )}

                            </span>

                        </td>


                        <td>
                            ${
                                execution.cpu_percent ??
                                "-"
                            }%
                        </td>


                        <td>
                            ${
                                execution.memory_percent ??
                                "-"
                            }%
                        </td>


                        <td>
                            ${
                                execution.disk_percent ??
                                "-"
                            }%
                        </td>


                        <td>

                            ${
                                execution.duration_ms ??
                                "-"
                            } ms

                        </td>


                        <td>

                            <span class="execution-time">

                                ${escapeOrionHTML(
                                    formatOrionDate(
                                        execution.completed_at
                                    )
                                )}

                            </span>

                        </td>


                        <td>

                            <button
                                class="execution-view-btn"
                                onclick="openExecutionReportFromHistory(${execution.id})"
                            >
                                View Report
                            </button>

                        </td>

                    </tr>

                `;

            }
        )
        .join("");

}



async function openExecutionReportFromHistory(
    executionId
) {

    const modal =
        document.getElementById(
            "executionReportModal"
        );


    const content =
        document.getElementById(
            "executionReportContent"
        );


    if (!modal || !content) {

        alert(
            "Execution report modal is missing."
        );

        return;
    }


    modal.classList.add(
        "show"
    );


    document.body.classList.add(
        "report-modal-open"
    );


    content.innerHTML = `

        <div class="report-loading">

            <div class="report-spinner"></div>

            Loading Execution #${executionId}...

        </div>

    `;


    await loadExecutionById(
        executionId
    );

}



// ==========================================================
// LOAD EXECUTION PAGE WHEN SIDEBAR OPENS IT
// ==========================================================

document.addEventListener(
    "click",
    function(event) {

        const button =
            event.target.closest(
                ".nav-btn"
            );


        if (!button) {
            return;
        }


        const onclick =
            button.getAttribute(
                "onclick"
            ) || "";


        if (
            onclick.includes(
                "showSection('executions'"
            )
        ) {

            setTimeout(
                () => {
                    loadExecutionHistory();
                },
                50
            );

        }

    }
);

