document.addEventListener("DOMContentLoaded", function () {
    // --- DOM Elements ---
    const codeEditor = document.getElementById("code-editor");
    const outputContainer = document.getElementById("outputContainer");
    const participantsList = document.getElementById("participants-list");
    const languageDropdown = document.getElementById("languageDropdown");
    const executeButton = document.getElementById("executeButton");
    const sendBtn = document.getElementById("sendBtn");
    const messageInput = document.getElementById("message");
    const allMessages = document.getElementById("messages");
    const adminKeyContainer = document.getElementById("admin-secret-key-container");
    const secretKeyDisplay = document.getElementById("secret-key-display");
    const leaveRoomBtn = document.getElementById("leave-room-btn");
    const fileUploadBtn = document.getElementById("file-upload-btn");
    const fileUploadInput = document.getElementById("file-upload-input");
    const fileExportBtn = document.getElementById("file-export-btn");
    const inviteBtn = document.getElementById("invite-btn");

    // --- Modal DOM Elements ---
    const modalOverlay = document.getElementById("modal-overlay");
    const modalTitle = document.getElementById("modal-title");
    const modalInput = document.getElementById("modal-input");
    const modalSubmitBtn = document.getElementById("modal-submit-btn");
    const modalError = document.getElementById("modal-error");

    // --- State ---
    const socket = io();
    const roomId = window.location.pathname.substring(1);
    let userName = '';
    let languageId = languageDropdown.value;
    let currentModalAction = null;
    let roomSecretKey = '';

    // --- Modal and Initial Join Flow ---
    function showNamePopup() {
        modalOverlay.style.display = 'flex';
        modalTitle.innerText = 'Enter Your Name';
        modalInput.placeholder = 'Your Name...';
        modalSubmitBtn.innerText = 'Join Session';
        modalError.innerText = '';
        currentModalAction = 'submit-name';
    }

    function showSecretKeyPopup() {
        modalOverlay.style.display = 'flex';
        modalTitle.innerText = 'Secret Key Required';
        modalInput.value = '';
        modalInput.placeholder = 'Enter Secret Key...';
        modalSubmitBtn.innerText = 'Verify Key';
        modalError.innerText = 'This room is protected.';
        currentModalAction = 'submit-key';
    }

    modalSubmitBtn.addEventListener('click', () => {
        const inputValue = modalInput.value.trim();

        if (currentModalAction === 'submit-name') {
            if (inputValue) {
                userName = inputValue;
                modalOverlay.style.display = 'none';
                socket.emit("join-request", { roomId, userName });
            } else {
                modalError.innerText = "Please enter a name to join.";
            }
        } else if (currentModalAction === 'submit-key') {
            if (inputValue) {
                modalError.innerText = 'Verifying...';
                socket.emit("verify-key", { roomId, userName, secretKey: inputValue });
            } else {
                modalError.innerText = "Please enter the secret key.";
            }
        }
    });

    // --- Feature Logic ---
    leaveRoomBtn.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    inviteBtn.addEventListener('click', () => {
        if (!roomSecretKey) return;

        const roomURL = window.location.href;
        const inviteText = `Join my CodeSync session!\n\nLink: ${roomURL}\nSecret Key: ${roomSecretKey}`;

        navigator.clipboard.writeText(inviteText).then(() => {
            const originalText = inviteBtn.innerText;
            inviteBtn.innerText = 'Copied!';
            inviteBtn.style.backgroundColor = 'var(--accent-secondary)';
            setTimeout(() => {
                inviteBtn.innerText = originalText;
                inviteBtn.style.backgroundColor = 'var(--bg-input)';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy invite text: ', err);
        });
    });

    fileUploadBtn.addEventListener('click', () => {
        fileUploadInput.click();
    });

    fileUploadInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileContent = e.target.result;
            codeEditor.value = fileContent;
            socket.emit("textUpdate", fileContent);
        };
        reader.readAsText(file);
        event.target.value = null;
    });

    fileExportBtn.addEventListener('click', () => {
        const code = codeEditor.value;
        const langId = languageDropdown.value;
        // UPDATED: extensionMap now uses the requested IDs
        const extensionMap = {
            '1': '.c',
            '2': '.cpp',
            '4': '.java',
            '28': '.py'
        };
        const fileExtension = extensionMap[langId] || '.txt';
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `code${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // --- Socket.IO Event Handlers ---
    socket.on("admin-init", ({ secretKey, participants }) => {
        roomSecretKey = secretKey;
        secretKeyDisplay.innerText = secretKey;
        adminKeyContainer.style.display = 'block';
        inviteBtn.style.display = 'block';
        updateParticipants(participants);
    });

    socket.on("secret-key-required", () => {
        showSecretKeyPopup();
    });

    socket.on("join-success", ({ participants }) => {
        modalOverlay.style.display = 'none';
        updateParticipants(participants);
    });

    socket.on("join-failed", (message) => {
        modalError.innerText = `Error: ${message}. Please try again.`;
    });

    function updateParticipants(participants) {
        participantsList.innerHTML = "";
        participants.forEach((participant) => {
            const listItem = document.createElement("li");
            listItem.textContent = participant.name;
            participantsList.appendChild(listItem);
        });
    }

    socket.on("updateParticipants", updateParticipants);

    socket.on("textUpdate", (data) => {
        if (data.id !== socket.id) {
            codeEditor.value = data.text;
        }
    });

    socket.on("message", (message) => {
        const msgElement = document.createElement('div');
        msgElement.className = 'chat-message';
        msgElement.innerText = message;
        allMessages.appendChild(msgElement);
        allMessages.scrollTop = allMessages.scrollHeight;
    });

    // --- DOM Event Listeners ---
    codeEditor.addEventListener("input", () => {
        socket.emit("textUpdate", codeEditor.value);
    });

    executeButton.addEventListener("click", () => {
        executeCode(codeEditor.value);
    });

    languageDropdown.addEventListener("change", () => {
        languageId = languageDropdown.value;
    });

    if (sendBtn) {
        const sendMessage = () => {
            const message = messageInput.value;
            if (message && userName) {
                socket.emit("user-message", `${userName}: ${message}`);
                messageInput.value = "";
            }
        };
        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    // --- Code Execution ---
    const API_HOST = "judge0-extra-ce.p.rapidapi.com";

    function executeCode(sourceCode) {
        if (!sourceCode.trim()) {
            alert("Please enter some code to execute.");
            return;
        }
        outputContainer.innerText = "Executing...";

        fetch('/execute-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourceCode: sourceCode,
                languageId: parseInt(languageId)
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error || !data[0]?.token) {
                throw new Error(data.error || "Failed to get submission token.");
            }
            const token = data[0].token;
            getSubmissionResult(token);
        })
        .catch(error => {
            console.error("Code execution failed:", error);
            outputContainer.innerText = "An error occurred during execution. Check the console.";
        });
    }

    function getSubmissionResult(token) {
        const checkStatus = () => {
            const options = {
                method: "GET",
                headers: {
                    "X-RapidAPI-Key": "b18550a92dmshaf84c14d5e4596ep1fb318jsnfda795c172cd",
                    "X-RapidAPI-Host": API_HOST,
                },
            };

            fetch(`https://${API_HOST}/submissions/batch?tokens=${token}&base64_encoded=true&fields=stdout,stderr,compile_output,status`, options)
            .then(response => response.json())
            .then(data => {
                const submission = data.submissions[0];
                if (!submission) {
                    throw new Error("Invalid submission response from API.");
                }
                const statusId = submission.status.id;
                if (statusId <= 2) {
                    setTimeout(checkStatus, 2000);
                } else {
                    let output = "";
                    if (submission.stdout) output = atob(submission.stdout);
                    else if (submission.stderr) output = atob(submission.stderr);
                    else if (submission.compile_output) output = atob(submission.compile_output);
                    else output = "Execution finished with no output.";
                    outputContainer.innerText = output;
                }
            })
            .catch(error => {
                console.error("Failed to get submission result:", error);
                outputContainer.innerText = "An error occurred while fetching the result.";
            });
        };
        checkStatus();
    }
    
    // --- Start the process ---
    showNamePopup();
});