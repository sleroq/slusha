import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import {
    createRouter,
    useBeforeLeave,
    useLocation,
    useNavigate,
} from '@solidjs/router';
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    onCleanup,
    Show,
    untrack,
} from 'solid-js';
import { Button, DialogSheet, ErrorNotice, Loading } from '@slusha/mini-app/ui';
import {
    DIALOG_CHANGE_EVENT,
    dismissTopDialog,
    hasOpenDialog,
} from '@slusha/mini-app/ui';
import {
    createTelegramAdapter,
    type TelegramAdapter,
} from '@slusha/mini-app/telegram';
import type {
    ConfigField,
    ConfigSelection,
} from '../../../shared/config-contract.ts';
import { createSettingsSession } from '../features/settings/session.ts';
import {
    EditorView,
    PersonalView,
    ScopeView,
    SectionView,
    SettingsLoading,
} from '../features/settings/editors.tsx';
import {
    sectionFor,
    type SectionId,
    sections,
    titleFor,
} from '../features/settings/sections.ts';

type HostFactory = (callbacks: {
    onBack: () => void;
    onMain: () => void;
}) => TelegramAdapter;

export type AppProps = { createHost?: HostFactory };

type Route = {
    valid: boolean;
    kind: 'home' | 'section' | 'editor';
    selection: ConfigSelection | undefined;
    section?: SectionId;
    field?: string;
};

function parseSelection(search: string): ConfigSelection | undefined {
    const params = new URLSearchParams(search);
    const scope = params.get('scope');
    const chatIdText = params.get('chatId');
    if (scope === null && chatIdText === null) return undefined;
    if (
        scope !== 'personal' && scope !== 'private' && scope !== 'group' &&
        scope !== 'global'
    ) return undefined;
    if (scope === 'private' || scope === 'group') {
        if (chatIdText === null || !/^-?\d+$/.test(chatIdText)) {
            return undefined;
        }
        const chatId = Number(chatIdText);
        if (!Number.isSafeInteger(chatId)) return undefined;
        return { scope, chatId };
    }
    if (chatIdText !== null) return undefined;
    return { scope };
}

function decodeSegment(segment: string) {
    try {
        const value = decodeURIComponent(segment);
        if (!value) return undefined;
        for (const character of value) {
            const code = character.codePointAt(0) ?? 0;
            if (code < 32 || code === 127) return undefined;
        }
        return value;
    } catch {
        return undefined;
    }
}

function parseRoute(pathname: string, search: string): Route {
    const selection = parseSelection(search);
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) {
        return {
            valid: selection !== undefined || search === '',
            kind: 'home',
            selection,
        };
    }
    if (parts[0] === 'section' && parts.length === 2) {
        const id = decodeSegment(parts[1]);
        let section;
        if (id) section = sectionFor(id);
        return {
            valid: Boolean(section) && selection !== undefined,
            kind: 'section',
            selection,
            section: section?.id,
        };
    }
    if (parts[0] === 'editor' && parts.length === 2) {
        const field = decodeSegment(parts[1]);
        let fieldSection;
        if (field) {
            const found = sectionFor(field);
            if (found) fieldSection = found.id;
        }
        return {
            valid: Boolean(field) && selection !== undefined,
            kind: 'editor',
            selection,
            field,
            section: fieldSection,
        };
    }
    if (
        parts[0] === 'section' && parts.length === 4 && parts[2] === 'editor'
    ) {
        const sectionId = decodeSegment(parts[1]);
        const field = decodeSegment(parts[3]);
        let section;
        if (sectionId) section = sectionFor(sectionId);
        let derived;
        if (field) derived = sectionFor(field);
        return {
            valid: Boolean(section) && Boolean(field) &&
                (!derived || derived.id === section?.id) &&
                selection !== undefined,
            kind: 'editor',
            selection,
            field,
            section: section?.id ?? derived?.id,
        };
    }
    return { valid: false, kind: 'home', selection: undefined };
}

function selectionUrl(
    selection: ConfigSelection,
    kind: Route['kind'] = 'home',
    section?: string,
    field?: string,
) {
    const params = new URLSearchParams({ scope: selection.scope });
    if (selection.chatId !== undefined) {
        params.set('chatId', String(selection.chatId));
    }
    let path = '/';
    if (kind === 'editor' && section && field) {
        path = `/section/${encodeURIComponent(section)}/editor/${
            encodeURIComponent(field)
        }`;
    } else if (kind === 'editor' && field) {
        path = `/editor/${encodeURIComponent(field)}`;
    } else if (kind === 'section' && section) {
        path = `/section/${encodeURIComponent(section)}`;
    }
    return `${path}?${params.toString()}`;
}

export function App(props: AppProps = {}) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: false,
                refetchOnWindowFocus: false,
            },
        },
    });
    const createHost = props.createHost ?? createTelegramAdapter;
    return (
        <QueryClientProvider client={queryClient}>
            <AppRoot createHost={createHost} />
        </QueryClientProvider>
    );
}

function NotFound() {
    const navigate = useNavigate();
    return (
        <main class='app-shell'>
            <h1 tabindex={-1}>Page not found</h1>
            <Button onClick={() => navigate('/')}>Go home</Button>
        </main>
    );
}

function AppRoot(props: { createHost: HostFactory }) {
    let backHandler = () => {};
    let mainHandler = () => {};
    const createHost = untrack(() => props.createHost);
    const adapter = createHost({
        onBack: () => backHandler(),
        onMain: () => mainHandler(),
    });
    const [auth, setAuth] = createSignal('');
    const [bootError, setBootError] = createSignal('');
    const [ready, setReady] = createSignal(false);
    const [currentRoute, setCurrentRoute] = createSignal<Route>(
        parseRoute(globalThis.location.pathname, globalThis.location.search),
    );
    let canonicalNavigation = (_selection: ConfigSelection) => {};
    const session = createSettingsSession({
        auth: () => auth(),
        selection: () => {
            if (currentRoute().valid) return currentRoute().selection;
            return undefined;
        },
        enabled: () => ready() && currentRoute().valid,
        onSaved: adapter.notifySuccess,
        onCanonicalSelection: (selection) => canonicalNavigation(selection),
    });
    const Router = createRouter({
        scrollRestoration: true,
        routes: [{ path: '/*route', component: () => null }],
    });
    createEffect(() => true, () => {
        void Promise.resolve().then(() => adapter.mount()).then((value) => {
            setAuth(value);
            setReady(true);
        }).catch((cause) => {
            if (cause instanceof Error) setBootError(cause.message);
            else setBootError('Could not initialize Telegram');
            setReady(true);
        });
    });
    onCleanup(() => adapter.dispose());
    return (
        <Router>
            {() => (
                <RouteOwner
                    auth={auth}
                    ready={ready}
                    bootError={bootError}
                    adapter={adapter}
                    session={session}
                    setRoute={setCurrentRoute}
                    registerCanonical={(handler) =>
                        canonicalNavigation = handler}
                    registerHandlers={(handlers) => {
                        backHandler = handlers.back;
                        mainHandler = handlers.main;
                    }}
                />
            )}
        </Router>
    );
}

function RouteOwner(props: {
    auth: () => string;
    ready: () => boolean;
    bootError: () => string;
    adapter: TelegramAdapter;
    session: ReturnType<typeof createSettingsSession>;
    setRoute: (route: Route) => void;
    registerCanonical: (
        handler: (selection: ConfigSelection) => void,
    ) => void;
    registerHandlers: (
        handlers: { back: () => void; main: () => void },
    ) => void;
}) {
    const location = useLocation();
    const route = createMemo(() =>
        parseRoute(location.pathname, location.search)
    );
    const navigate = useNavigate();
    const registerCanonical = untrack(() => props.registerCanonical);
    registerCanonical((selection) => {
        const currentRoute = untrack(() => route());
        if (
            currentRoute.valid && currentRoute.kind === 'home' &&
            currentRoute.selection === undefined
        ) {
            navigate(selectionUrl(selection), { replace: true });
        }
    });
    createEffect(
        () => [location.pathname, location.search],
        () => {
            props.setRoute(route());
        },
    );
    return (
        <Show
            when={props.ready()}
            fallback={<Loading label='Starting settings' />}
        >
            <Show
                when={!props.bootError()}
                fallback={
                    <main class='app-shell'>
                        <ErrorNotice message={props.bootError()} />
                    </main>
                }
            >
                <Show when={route().valid} fallback={<NotFound />}>
                    <SettingsApp
                        auth={props.auth()}
                        route={route()}
                        location={location}
                        navigate={navigate}
                        adapter={props.adapter}
                        session={props.session}
                        registerHandlers={props.registerHandlers}
                    />
                </Show>
            </Show>
        </Show>
    );
}

type SettingsAppProps = {
    auth: string;
    route: Route;
    location: ReturnType<typeof useLocation>;
    navigate: ReturnType<typeof useNavigate>;
    adapter: TelegramAdapter;
    session: ReturnType<typeof createSettingsSession>;
    registerHandlers: (
        handlers: { back: () => void; main: () => void },
    ) => void;
};

function SettingsApp(props: SettingsAppProps) {
    const session = untrack(() => props.session);
    const [dialog, setDialog] = createSignal<'unsaved' | 'chat' | 'reset'>();
    const [resetField, setResetField] = createSignal<ConfigField>();
    const [chatType, setChatType] = createSignal<'private' | 'group'>(
        'private',
    );
    const [chatSearch, setChatSearch] = createSignal('');
    const [pending, setPending] = createSignal<{
        to: string | number;
        retry: (force?: boolean) => void;
        selection: ConfigSelection | undefined;
    }>();
    const [openDialog, setOpenDialog] = createSignal(false);
    let heading: HTMLHeadingElement | undefined;
    let focusHeading = false;

    createEffect(() => true, () => {
        const update = () => setOpenDialog(hasOpenDialog());
        document.addEventListener(DIALOG_CHANGE_EVENT, update);
        update();
        onCleanup(() =>
            document.removeEventListener(DIALOG_CHANGE_EVENT, update)
        );
    });

    createEffect(
        () => [props.location.pathname, props.location.search],
        () => {
            if (!focusHeading) return;
            focusHeading = false;
            queueMicrotask(() => heading?.focus());
        },
    );

    useBeforeLeave((event) => {
        const from = parseSelection(event.from.search);
        const target: string | number = event.to;
        let targetLocation = event.to;
        if (typeof event.to === 'number') {
            targetLocation = globalThis.location.pathname +
                globalThis.location.search;
        }
        let targetRoute: Route | undefined;
        if (typeof targetLocation === 'string') {
            const destination = new URL(
                targetLocation,
                globalThis.location.origin,
            );
            targetRoute = parseRoute(
                destination.pathname,
                destination.search,
            );
        }
        const to = targetRoute?.selection;
        const scopeChanged = from?.scope !== to?.scope ||
            from?.chatId !== to?.chatId;
        if (!scopeChanged) return;
        if (session.saving()) {
            event.preventDefault();
            return;
        }
        if (!session.dirty()) return;
        event.preventDefault();
        setPending({ to: target, retry: event.retry, selection: to });
        setDialog('unsaved');
    });

    const registerHandlers = untrack(() => props.registerHandlers);
    registerHandlers({ back, main: handleMain });
    onCleanup(() => registerHandlers({ back: () => {}, main: () => {} }));

    createEffect(
        () => [
            session.dirty(),
            session.saving(),
            Object.keys(session.validation()).join(','),
            openDialog(),
            canGoBack(),
        ],
        () => {
            const dirty = session.dirty();
            const saving = session.saving();
            props.adapter.sync({
                confirmClosing: dirty,
                backVisible: canGoBack() || openDialog(),
                main: {
                    text: saveLabel(),
                    visible: dirty,
                    enabled: dirty &&
                        Object.keys(session.validation()).length === 0 &&
                        !saving,
                    loading: saving,
                },
            });
        },
    );

    function canGoBack() {
        return props.route.kind !== 'home' ||
            props.route.selection?.scope !== 'personal';
    }

    function routeTo(
        selection: ConfigSelection,
        kind: Route['kind'] = 'home',
        section?: string,
        field?: string,
        replace = false,
    ) {
        focusHeading = true;
        props.navigate(selectionUrl(selection, kind, section, field), {
            replace,
        });
    }

    function requestSelection(next: ConfigSelection) {
        routeTo(next);
    }

    function back() {
        if (hasOpenDialog()) {
            dismissTopDialog();
            return;
        }
        if (props.route.kind === 'editor') {
            const section = props.route.section;
            if (section) routeTo(props.route.selection!, 'section', section);
            else routeTo(props.route.selection!);
            return;
        }
        if (props.route.kind === 'section') {
            routeTo(props.route.selection!);
            return;
        }
        if (props.route.selection?.scope !== 'personal') {
            routeTo({ scope: 'personal' });
            return;
        }
        props.navigate(-1);
    }

    function handleMain() {
        if (dialog() === 'unsaved') {
            void saveAndContinue();
            return;
        }
        void session.save();
    }

    function saveLabel() {
        const count = session.dirtyFields().length;
        if (session.saving()) return 'Saving…';
        if (count === 0) return 'Saved';
        if (count === 1) return 'Save 1 change';
        return `Save ${count} changes`;
    }

    async function saveAndContinue() {
        const next = pending();
        if (!next || session.saving()) return;
        if (!(await session.save())) return;
        setPending();
        setDialog();
        next.retry(true);
    }

    function discardAndContinue() {
        const next = pending();
        if (!next || session.saving()) return;
        if (next.selection) session.installCached(next.selection);
        setPending();
        setDialog();
        next.retry(true);
    }

    function closeUnsaved(event?: Event) {
        if (session.saving()) {
            event?.preventDefault();
            return;
        }
        setDialog();
        setPending();
    }

    function requestReset(field: ConfigField) {
        setResetField(field);
        setDialog('reset');
    }

    function confirmReset() {
        const field = resetField();
        if (field) session.setReset(field);
        setDialog();
    }

    function openChats(type: 'private' | 'group') {
        setChatType(type);
        setChatSearch('');
        setDialog('chat');
    }

    const data = () => session.query.data;
    const chatList = createMemo(() => {
        const query = chatSearch().toLocaleLowerCase();
        return (data()?.chats ?? []).filter((chat) =>
            chat.type === chatType() &&
            chat.title.toLocaleLowerCase().includes(query)
        );
    });
    const editorField = createMemo(() => {
        if (!props.route.field) return undefined;
        return session.fields().find((field) =>
            field.key === props.route.field
        );
    });
    const saveRetry = createMemo<(() => void) | undefined>(() => {
        const error = session.saveError();
        if (error?.retryable) return () => void session.save();
        return undefined;
    });
    function chatPickerTitle() {
        if (chatType() === 'private') return 'Choose a private chat';
        return 'Choose a group chat';
    }
    function unsavedActionLabel() {
        if (session.saving()) return 'Saving…';
        return 'Save and continue';
    }
    const pageTitle = createMemo(() => {
        if (editorField()) return titleFor(editorField()!.key);
        if (props.route.section) return sectionFor(props.route.section)!.title;
        if (props.route.selection?.scope === 'personal') {
            return 'Slusha Settings';
        }
        if (props.route.selection?.scope === 'global') return 'Global Settings';
        const chat = data()?.chats.find((item) =>
            item.id === props.route.selection?.chatId
        );
        if (chat) return chat.title;
        return 'Chat Settings';
    });
    const availableSections = createMemo(() =>
        sections.filter((item) =>
            item.keys.some((key) =>
                session.fields().some((field) => field.key === key)
            )
        )
    );

    return (
        <main
            class='app-shell'
            style={{
                'padding-top': 'var(--app-safe-top)',
                'padding-left': 'max(.75rem, var(--app-safe-left))',
                'padding-right': 'max(.75rem, var(--app-safe-right))',
            }}
        >
            <header class='app-header'>
                <Show when={canGoBack() && !props.adapter.nativeBack}>
                    <Button class='button-plain back-button' onClick={back}>
                        ‹ Back
                    </Button>
                </Show>
                <h1 ref={(element) => heading = element} tabindex={-1}>
                    {pageTitle()}
                </h1>
            </header>
            <Show
                when={session.query.isFetching && session.fields().length > 0}
            >
                <p class='refreshing' role='status'>Refreshing…</p>
            </Show>
            <Show when={session.query.isError && session.fields().length > 0}>
                <ErrorNotice
                    message={session.query.error?.message ??
                        'Could not refresh settings'}
                    retry={() => void session.query.refetch()}
                />
            </Show>
            <Show
                when={session.query.isPending && session.fields().length === 0}
            >
                <SettingsLoading
                    personal={props.route.selection === undefined ||
                        props.route.selection.scope === 'personal'}
                />
            </Show>
            <Show when={session.query.isError && session.fields().length === 0}>
                <ErrorNotice
                    message={session.query.error?.message ??
                        'Could not load settings'}
                    retry={() => void session.query.refetch()}
                />
            </Show>
            <Show
                when={!session.query.isPending &&
                    !(session.query.isError && session.fields().length === 0)}
            >
                <Show when={!props.route.field && props.route.section}>
                    <SectionView
                        section={sectionFor(props.route.section!)!}
                        fields={session.fields()}
                        saving={session.saving()}
                        validation={session.validation()}
                        resetKeys={session.resetKeys()}
                        onChange={session.updateField}
                        onRaw={session.updateRaw}
                        inputValue={session.draft.inputValue}
                        onReset={requestReset}
                        onCancelReset={session.cancelReset}
                        isDirty={session.draft.isDirty}
                        onOpen={(key) =>
                            routeTo(
                                props.route.selection!,
                                'editor',
                                props.route.section,
                                key,
                            )}
                    />
                </Show>
                <Show when={props.route.field}>
                    <Show when={editorField()} fallback={<NotFound />}>
                        <EditorView
                            field={editorField()}
                            saving={session.saving()}
                            validation={session.validation()}
                            reset={session.resetKeys().has(editorField()!.key)}
                            onChange={session.updateField}
                            onRaw={session.updateRaw}
                            inputValue={session.draft.inputValue}
                            onReset={requestReset}
                            onCancelReset={session.cancelReset}
                        />
                    </Show>
                </Show>
                <Show
                    when={!props.route.field && !props.route.section &&
                        props.route.selection?.scope === 'personal'}
                >
                    <PersonalView
                        data={data()}
                        fields={session.fields()}
                        saving={session.saving()}
                        validation={session.validation()}
                        onChange={session.updateField}
                        onScope={openChats}
                        onGlobal={() => requestSelection({ scope: 'global' })}
                    />
                </Show>
                <Show
                    when={!props.route.field && !props.route.section &&
                        props.route.selection?.scope !== 'personal'}
                >
                    <ScopeView
                        fields={session.fields()}
                        sections={availableSections()}
                        saving={session.saving()}
                        onOpen={(id) =>
                            routeTo(props.route.selection!, 'section', id)}
                    />
                </Show>
            </Show>
            <Show when={session.saveError()}>
                <ErrorNotice
                    message={session.saveError()!.message}
                    retry={saveRetry()}
                />
            </Show>
            <Show
                when={session.dirty() && !session.query.isPending &&
                    !props.adapter.nativeMain}
            >
                <div class='save-bar'>
                    <Button
                        class='button-primary save-button'
                        disabled={session.saving() ||
                            Object.keys(session.validation()).length > 0}
                        onClick={() => void session.save()}
                    >
                        {saveLabel()}
                    </Button>
                </div>
            </Show>
            <Show when={dialog() === 'chat'}>
                <DialogSheet
                    open
                    title={chatPickerTitle()}
                    onClose={() => setDialog()}
                >
                    <div class='chat-picker'>
                        <input
                            autofocus
                            type='search'
                            placeholder='Search'
                            value={chatSearch()}
                            onInput={(event) =>
                                setChatSearch(event.currentTarget.value)}
                        />
                        <For each={chatList()}>
                            {(chat) => (
                                <button
                                    type='button'
                                    onClick={() => {
                                        setDialog();
                                        requestSelection({
                                            scope: chatType(),
                                            chatId: chat.id,
                                        });
                                    }}
                                >
                                    {chat.title}
                                </button>
                            )}
                        </For>
                    </div>
                </DialogSheet>
            </Show>
            <Show when={dialog() === 'unsaved'}>
                <DialogSheet
                    open
                    title='Save your changes?'
                    onClose={closeUnsaved}
                >
                    <p>
                        Save or discard the changes in this scope before
                        switching.
                    </p>
                    <div class='dialog-actions'>
                        <Button
                            class='button-primary'
                            disabled={session.saving()}
                            onClick={() => void saveAndContinue()}
                        >
                            {unsavedActionLabel()}
                        </Button>
                        <Button
                            disabled={session.saving()}
                            onClick={discardAndContinue}
                        >
                            Discard changes
                        </Button>
                        <Button
                            class='button-plain'
                            disabled={session.saving()}
                            onClick={() => setDialog()}
                        >
                            Stay
                        </Button>
                    </div>
                </DialogSheet>
            </Show>
            <Show when={dialog() === 'reset'}>
                <DialogSheet
                    open
                    title={`Revert ${titleFor(resetField()?.key ?? '')}?`}
                    onClose={() => setDialog()}
                >
                    <p>
                        This setting will return to its inherited value when you
                        save.
                    </p>
                    <div class='dialog-actions'>
                        <Button class='button-primary' onClick={confirmReset}>
                            Revert
                        </Button>
                        <Button
                            class='button-plain'
                            onClick={() => setDialog()}
                        >
                            Cancel
                        </Button>
                    </div>
                </DialogSheet>
            </Show>
        </main>
    );
}
