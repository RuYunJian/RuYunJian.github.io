(() => {
    "use strict";

    const VERSION = "UIN-DetPW v2";
    const encoder = new TextEncoder();
    const alphabets = {
        compatible: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_=+",
    };
    const requiredClasses = [
        { label: "大写字母", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
        { label: "小写字母", chars: "abcdefghijklmnopqrstuvwxyz" },
        { label: "数字", chars: "0123456789" },
        { label: "特殊符号", chars: "!@#$%^&*-_=+" },
    ];
    const profiles = {
        balanced: { mem: 65536, time: 3, parallelism: 4 },
        light: { mem: 32768, time: 3, parallelism: 1 },
    };

    const $ = (selector) => document.querySelector(selector);
    const form = $("#password-form");
    const target = $("#target");
    const initials = $("#initials");
    const digits = $("#digits");
    const masterKey = $("#master-key");
    const lengthInput = $("#length");
    const alphabetInput = $("#alphabet");
    const profileInput = $("#profile");
    const result = $("#result");
    const deriveButton = $("#derive-button");
    const deriveLabel = $("#derive-label");
    const formMessage = $("#form-message");
    const copyButton = $("#copy-result");
    const clearButton = $("#clear-result");
    const saltPreview = $("#salt-preview");
    const contextPreview = $("#context-preview");
    const toggleMaster = $("#toggle-master");
    const toggleResult = $("#toggle-result");
    const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));

    let targetMode = "url";

    function bytes(text) {
        return encoder.encode(text);
    }

    function concatBytes(...chunks) {
        const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const out = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    }

    function i2osp32(n) {
        if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) {
            throw new Error("长度前缀超出 I2OSP32 范围。");
        }
        return new Uint8Array([
            (n >>> 24) & 0xff,
            (n >>> 16) & 0xff,
            (n >>> 8) & 0xff,
            n & 0xff,
        ]);
    }

    function i2osp8(n) {
        if (!Number.isInteger(n) || n < 0 || n > 255) {
            throw new Error("输出长度超出 I2OSP8 范围。");
        }
        return new Uint8Array([n]);
    }

    function tlv(tag, value) {
        return concatBytes(bytes(tag), i2osp32(value.length), value);
    }

    function toHex(data) {
        return Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
    }

    function xor32(a, b) {
        const out = new Uint8Array(32);
        for (let i = 0; i < 32; i += 1) {
            out[i] = a[i] ^ b[i];
        }
        return out;
    }

    function wipe(data) {
        if (data && typeof data.fill === "function") {
            data.fill(0);
        }
    }

    async function digestSha256(data) {
        return new Uint8Array(await window.crypto.subtle.digest("SHA-256", data));
    }

    async function importHmacKey(keyBytes) {
        return window.crypto.subtle.importKey(
            "raw",
            keyBytes,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
    }

    async function hmacSha256(keyBytes, data) {
        const key = await importHmacKey(keyBytes);
        return new Uint8Array(await window.crypto.subtle.sign("HMAC", key, data));
    }

    async function hmacWithKey(key, data) {
        return new Uint8Array(await window.crypto.subtle.sign("HMAC", key, data));
    }

    async function hkdfExtract(salt, ikm) {
        return hmacSha256(salt, ikm);
    }

    async function hkdfExpand(prk, info, outputLength) {
        if (outputLength > 255 * 32) {
            throw new Error("HKDF 输出长度超过 SHA-256 单次扩展上限。");
        }
        const key = await importHmacKey(prk);
        const blocks = [];
        let previous = new Uint8Array(0);
        let produced = 0;
        let counter = 1;

        while (produced < outputLength) {
            previous = await hmacWithKey(key, concatBytes(previous, info, new Uint8Array([counter])));
            blocks.push(previous);
            produced += previous.length;
            counter += 1;
        }

        return concatBytes(...blocks).slice(0, outputLength);
    }

    async function argon2id(master, salt, params) {
        if (!window.argon2 || !window.argon2.ArgonType) {
            throw new Error("Argon2 运行时未加载。");
        }
        const hash = await window.argon2.hash({
            pass: master,
            salt,
            time: params.time,
            mem: params.mem,
            parallelism: params.parallelism,
            hashLen: 32,
            type: window.argon2.ArgonType.Argon2id,
        });
        return new Uint8Array(hash.hash);
    }

    function rejectionSample(data, alphabet, outputLength) {
        const n = alphabet.length;
        const threshold = Math.floor(256 / n) * n;
        const chars = [];
        for (const value of data) {
            if (value < threshold) {
                chars.push(alphabet[value % n]);
                if (chars.length === outputLength) {
                    return chars.join("");
                }
            }
        }
        return null;
    }

    function hasAny(text, chars) {
        for (const char of chars) {
            if (text.includes(char)) {
                return true;
            }
        }
        return false;
    }

    function missingRequiredClasses(text) {
        return requiredClasses
            .filter((group) => !hasAny(text, group.chars))
            .map((group) => group.label);
    }

    function passwordMeetsPolicy(password) {
        return missingRequiredClasses(password).length === 0;
    }

    async function samplePasswordCandidate(prk, info, alphabet, outputLength) {
        const threshold = Math.floor(256 / alphabet.length) * alphabet.length;
        let byteLength = Math.max(32, Math.ceil((outputLength * 256) / threshold) + 16);

        for (let round = 0; round < 6; round += 1) {
            const stream = await hkdfExpand(prk, info, byteLength);
            const password = rejectionSample(stream, alphabet, outputLength);
            wipe(stream);
            if (password) {
                return password;
            }
            byteLength *= 2;
        }

        throw new Error("输出编码采样失败，请降低长度或更换字符集。");
    }

    async function encodePassword(prk, info, alphabet, outputLength) {
        const missingFromAlphabet = missingRequiredClasses(alphabet);
        if (missingFromAlphabet.length > 0) {
            throw new Error(`字符集缺少${missingFromAlphabet.join("、")}，无法满足站点强制规则。`);
        }

        // Generate a full-string uniform candidate first, then reject the whole string
        // unless it contains upper, lower, digit and special characters.
        for (let attempt = 0; attempt < 64; attempt += 1) {
            const attemptInfo = concatBytes(info, bytes("UDPG/policy/v2"), i2osp32(attempt));
            const password = await samplePasswordCandidate(prk, attemptInfo, alphabet, outputLength);
            if (passwordMeetsPolicy(password)) {
                return password;
            }
        }

        throw new Error("输出策略采样失败，请稍后重试。");
    }

    async function derivePassword(input, progress) {
        const targetBytes = bytes(input.target);
        const initialsBytes = bytes(input.initials);
        const digitsBytes = bytes(input.digits);
        const masterBytes = bytes(input.masterKey);
        const ctx = concatBytes(
            tlv("U", targetBytes),
            tlv("I", initialsBytes),
            tlv("D", digitsBytes),
        );
        const saltDigest = await digestSha256(concatBytes(bytes("UDPG/salt/v1"), ctx));
        const salt = saltDigest.slice(0, 16);

        progress("Argon2id 正在拉伸主密钥...");
        await nextFrame();
        const k0 = await argon2id(masterBytes, salt, input.params);

        progress("HKDF 正在分离子密钥...");
        const prk = await hkdfExtract(salt, k0);
        const seed = await hkdfExpand(prk, concatBytes(bytes("UDPG/seed/v1"), ctx), 64);
        let left = seed.slice(0, 32);
        let right = seed.slice(32, 64);

        // The PDF vectors match through PRK; its Feistel examples diverge from the published formula.
        // This implementation treats the formula and pseudocode as normative.
        progress("Feistel 正在混淆上下文...");
        for (let r = 1; r <= 4; r += 1) {
            const f = await hmacSha256(k0, concatBytes(bytes("R"), i2osp8(r), right, ctx));
            const newRight = xor32(left, f);
            wipe(left);
            wipe(f);
            left = right;
            right = newRight;
        }

        const finalState = concatBytes(left, right);
        const encInfo = concatBytes(bytes("UDPG/enc/v2"), finalState, i2osp8(input.outputLength));

        progress("正在编码输出...");
        const password = await encodePassword(prk, encInfo, input.alphabet, input.outputLength);
        const contextDigest = await digestSha256(ctx);

        wipe(masterBytes);
        wipe(saltDigest);
        wipe(k0);
        wipe(prk);
        wipe(seed);
        wipe(left);
        wipe(right);
        wipe(finalState);

        return {
            password,
            saltHex: toHex(salt),
            contextHex: toHex(contextDigest.slice(0, 8)),
        };
    }

    function nextFrame() {
        return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }

    function setMessage(text, type = "info") {
        formMessage.textContent = text;
        formMessage.classList.toggle("error", type === "error");
    }

    function setWorking(isWorking, label) {
        deriveButton.disabled = isWorking;
        deriveButton.classList.toggle("is-working", isWorking);
        deriveLabel.textContent = isWorking ? "计算中..." : "生成口令";
        if (label) {
            setMessage(label);
        }
    }

    function setMode(mode) {
        targetMode = mode;
        const isApp = mode === "app";
        target.placeholder = isApp ? "GitHub Mobile" : "https://example.com/login";
        modeButtons.forEach((button) => {
            const active = button.dataset.mode === mode;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", String(active));
        });
    }

    function readInput() {
        const outputLength = Number(lengthInput.value);
        if (!Number.isInteger(outputLength) || outputLength < 15 || outputLength > 64) {
            throw new Error("长度必须在 15 到 64 之间。");
        }
        if (!/^[A-Za-z]{3}$/.test(initials.value)) {
            throw new Error("3 位首字母必须是 ASCII 字母，并且大小写会被保留。");
        }
        if (!/^[0-9]{8}$/.test(digits.value)) {
            throw new Error("8 位数字必须完整填写，前导零会被保留。");
        }
        if (target.value.length === 0) {
            throw new Error("标识不能为空。");
        }
        if (masterKey.value.length === 0) {
            throw new Error("主密钥不能为空。");
        }

        const alphabet = alphabets[alphabetInput.value];
        const params = profiles[profileInput.value];
        if (!alphabet) {
            throw new Error("请选择有效字符集。");
        }
        if (!params) {
            throw new Error("请选择有效计算档位。");
        }

        return {
            target: target.value,
            targetMode,
            initials: initials.value,
            digits: digits.value,
            masterKey: masterKey.value,
            outputLength,
            alphabet,
            params,
        };
    }

    function clearOutput() {
        result.value = "";
        result.type = "password";
        toggleResult.textContent = "显";
        copyButton.disabled = true;
        saltPreview.textContent = "-";
        contextPreview.textContent = "-";
        setMessage("");
    }

    function toggleSecret(input, button) {
        const hidden = input.type === "password";
        input.type = hidden ? "text" : "password";
        button.textContent = hidden ? "隐" : "显";
    }

    async function copyResult() {
        if (!result.value) {
            return;
        }
        try {
            await navigator.clipboard.writeText(result.value);
            setMessage("已复制到剪贴板。");
        } catch (error) {
            result.type = "text";
            result.select();
            document.execCommand("copy");
            result.setSelectionRange(0, 0);
            setMessage("已复制到剪贴板。");
        }
    }

    modeButtons.forEach((button) => {
        button.addEventListener("click", () => setMode(button.dataset.mode));
    });

    toggleMaster.addEventListener("click", () => toggleSecret(masterKey, toggleMaster));
    toggleResult.addEventListener("click", () => toggleSecret(result, toggleResult));
    clearButton.addEventListener("click", clearOutput);
    copyButton.addEventListener("click", copyResult);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearOutput();

        if (!window.crypto || !window.crypto.subtle) {
            setMessage("当前环境不支持 Web Crypto。请使用 HTTPS 或 localhost 打开页面。", "error");
            return;
        }

        let input;
        try {
            input = readInput();
        } catch (error) {
            setMessage(error.message, "error");
            return;
        }

        setWorking(true, "正在准备上下文...");

        try {
            const output = await derivePassword(input, (text) => setMessage(text));
            result.value = output.password;
            copyButton.disabled = false;
            saltPreview.textContent = output.saltHex;
            contextPreview.textContent = `${input.targetMode === "app" ? "App" : "URL"} / ${input.target.length} 字符 / ${output.contextHex}`;
            const spaceNote = /^\s|\s$/.test(input.target) ? " 标识包含首尾空格，已按原样计算。" : "";
            setMessage(`已生成 ${input.outputLength} 位口令，包含大小写、数字和特殊符号。${spaceNote}`);
        } catch (error) {
            console.error(error);
            setMessage(error && error.message ? error.message : "生成失败。", "error");
        } finally {
            setWorking(false);
        }
    });

    setMode("url");
})();
