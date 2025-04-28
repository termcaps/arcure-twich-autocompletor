// ==UserScript==
// @name         Arcure Chat Command Autocomplete
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Autocomplete Twitch chat commands with ! + Tab
// @author       termcaps
// @match        https://www.twitch.tv/arcuredev
// @match        https://*.twitch.tv/*
// @match        https://dashboard.twitch.tv/*
// @match        https://*.twitch.tv/popout/*
// @updateURL    https://raw.githubusercontent.com/termcaps/arcure-twich-autocompletor/main/arcure-twich-autocompletor.js
// @downloadURL  https://raw.githubusercontent.com/termcaps/arcure-twich-autocompletor/main/arcure-twich-autocompletor.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function () {
    'use strict';


    const commands = [
        "3degrés", "pouyanné", "casse", "cdlamerde", "crame_tout", "crame",
        "dkdance", "efforts", "g_rien_compris", "g_compris_r", "maths", "monde_de_merde",
        "mondedemerde", "notredame", "on_en_a_gros", "gros", "pas_rire", "bayrou_rire",
        "pasrire", "pas_sympa", "plutot_mourir", "plutotmourir", "mourir", "prédire",
        "réalité", "révolte", "robot", "détecte", "travailler", "taff", "tout_cramer",
        "nul", "stack", "projet"
    ];

    let suggestionBox = null;
    let currentSelection = -1;
    let filtered = [];
    let tabPressed = false;

    function createSuggestionBox() {
        suggestionBox = document.createElement('div');
        Object.assign(suggestionBox.style, {
            position: 'absolute',
            background: '#18181b',
            border: '1px solid #9147ff',
            borderRadius: '4px',
            maxHeight: '200px',
            overflowY: 'auto',
            overflowX: 'hidden',
            zIndex: 10000,
            fontSize: '14px',
            color: '#fff',
            minWidth: '150px'
        });
        document.body.appendChild(suggestionBox);
        suggestionBox.addEventListener('mousedown', e => e.preventDefault());
        console.log('[AutoComplete] Suggestion box created');
    }

    // Use normalize to make the search insensitive to accentuated chars so "revolte" will match "révolte"
    const normalize = str => str.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

    function showSuggestions(input) {
        if (!suggestionBox) createSuggestionBox();

        const text = input.textContent;
        const match = text.match(/!(\w*)$/);
        const filter = match ? normalize(match[1]) : '';

        filtered = commands.filter(cmd => normalize(cmd).includes(filter));
        currentSelection = -1;

        suggestionBox.innerHTML = '';
        if (!filtered.length) {
            console.log('[AutoComplete] No suggestions found for filter:', filter);
            hideSuggestions();
            return;
        }

        filtered.forEach((cmd, idx) => {
            const item = document.createElement('div');
            item.textContent = `!${cmd}`;
            item.style.padding = '4px 8px';
            item.style.cursor = 'pointer';
            item.addEventListener('mouseenter', () => highlightItem(idx));
            item.addEventListener('click', () => selectItem(input, idx));
            suggestionBox.appendChild(item);
        });

        highlightItem(0);

        const rect = input.getBoundingClientRect();
        suggestionBox.style.top = `${rect.top + window.scrollY - suggestionBox.offsetHeight - 4}px`;
        suggestionBox.style.left = `${rect.left + window.scrollX}px`;

        console.log('[AutoComplete] Showing suggestions:', filtered);
    }

    function hideSuggestions() {
        if (suggestionBox) suggestionBox.innerHTML = '';
        filtered = [];
        currentSelection = -1;
        tabPressed = false;
        console.log('[AutoComplete] Suggestions hidden');
    }

    function highlightItem(idx) {
        const children = suggestionBox.children;
        if (currentSelection >= 0 && children[currentSelection]) {
            children[currentSelection].style.background = '';
        }
        currentSelection = idx;
        if (children[currentSelection]) {
            children[currentSelection].style.background = '#9147ff';
            children[currentSelection].scrollIntoView({ block: 'nearest' });
        }
    }

    // Fcking SlateJS shit force us to do this monstruosity black magic
    // just to change the input of the tchat message
    async function simulateTyping(input, text) {
        input.focus();

        // Select all text
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        selection.removeAllRanges();
        selection.addRange(range);

        // Simulate pressing Backspace on the whole original selection to delete everything
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Backspace',
            code: 'Backspace',
            bubbles: true,
        }));

        await new Promise(resolve => setTimeout(resolve, 10));

        input.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Backspace',
            code: 'Backspace',
            bubbles: true,
        }));

        await new Promise(resolve => setTimeout(resolve, 20)); // wait a little for Twitch/Slate to handle the deletion

        // Now do the paste, that's the easiest way to integrate with Slate internal state
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', text);

        const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: clipboardData,
            bubbles: true,
            cancelable: true,
        });

        input.dispatchEvent(pasteEvent);

        selection.removeAllRanges(); // clean up selection
    }



    function selectItem(input, idx) {
        if (!filtered[idx]) return;
        const newText = `!${filtered[idx]} `;

        simulateTyping(input, newText.trim());

        console.log('[AutoComplete] Selected suggestion:', filtered[idx]);
        hideSuggestions();
    }

    function attachListenersToInput(input) {
        // We already attached a listener to the input element, we don't wanna do it again
        // We place a singleton onto the element in the DOM as a global value
        if (input.dataset.autocompleteAttached) return;
        input.dataset.autocompleteAttached = 'true';

        console.log('[AutoComplete] Attaching listeners to input:', input);

        input.addEventListener('keydown', e => {
            if (filtered.length && suggestionBox) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    highlightItem((currentSelection + 1) % filtered.length);
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    // Cycle down between options
                    highlightItem((currentSelection - 1 + filtered.length) % filtered.length);
                    return;
                }
            }

            // If we re-hit Tab within the suggestion, we select the current selected option
            // and hide the dialog
            if (e.key === 'Tab') {
                const text = input.textContent;
                if (text && /!\w*$/.test(text)) {
                    e.preventDefault();
                    if (!tabPressed) {
                        showSuggestions(input);
                        tabPressed = true;
                    } else if (filtered.length > 0 && currentSelection >= 0) {
                        selectItem(input, currentSelection);
                        setTimeout(() => {
                            input.focus();
                        }, 0);
                        tabPressed = false;
                    }
                }
            }

            if (e.key === 'Escape') {
                hideSuggestions();
            }
        });

        input.addEventListener('input', () => {
            const text = input.textContent;
            // If none sugesstions match, hide the input
            if (!text.match(/!\w*$/)) {
                hideSuggestions();
            } else if (tabPressed) {
                showSuggestions(input);
            }
        });

        // When we click a box, we select the option
        document.addEventListener('click', e => {
            if (suggestionBox && !suggestionBox.contains(e.target) && e.target !== input) {
                hideSuggestions();
            }
        });
    }

    // We need to listen over mutation for potential react DOM changes and re-get the rigth input
    // as react will replace them on re-render
    function observeForChatInput() {
        const observer = new MutationObserver(() => {
            const input = document.querySelector('div[data-a-target="chat-input"]');
            if (input) {
                attachListenersToInput(input);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    const existing = document.querySelector('div[data-a-target="chat-input"]');
    if (existing) {
        console.log('[AutoComplete] Chat input already present on page load');
        attachListenersToInput(existing);
    }

    observeForChatInput();
})();
