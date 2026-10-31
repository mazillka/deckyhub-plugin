// Minimal visual stand-in for @decky/ui, for local browser preview only.
// The real components are scraped at runtime from Steam's own webpack bundle
// (via findModuleExport), so nothing here is pixel-accurate — this exists to
// exercise layout and logic, not to review visuals.
import React, { createElement, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

export function PanelSection({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <section className="steam-panel">
      {/* A div like Steam's, still a heading for the tests that find sections by title. */}
      {title && <div className="steam-panel-title" role="heading" aria-level={3}>{title}</div>}
      {children}
    </section>
  );
}

export function PanelSectionRow({ children }: { children?: ReactNode }) {
  return <div className="steam-row">{children}</div>;
}

export function Button({
  onClick,
  disabled,
  children,
  style,
  onSecondaryButton,
  onSecondaryActionDescription,
  onOptionsButton,
  onOptionsActionDescription,
  onMenuButton,
  onMenuActionDescription,
  "aria-label": ariaLabel,
  "aria-expanded": ariaExpanded,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
  onSecondaryButton?: () => void;
  onSecondaryActionDescription?: string;
  onOptionsButton?: () => void;
  onOptionsActionDescription?: string;
  onMenuButton?: () => void;
  onMenuActionDescription?: string;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
}) {
  // Stands in for Steam's footer legend: "y"/"x"/"m" act as the Y/X/Menu buttons, and DevShell's
  // bottom bar shows data-secondary-hint/data-options-hint/data-menu-hint while this is focused.
  return (
    // Like Steam's DialogButton, a disabled button stays focusable (the D-pad can land
    // on it) but is dimmed and ignores presses.
    <button
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      className={disabled ? "steam-button Disabled" : "steam-button"}
      style={style}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      data-secondary-hint={onSecondaryButton ? onSecondaryActionDescription : undefined}
      data-options-hint={onOptionsButton ? onOptionsActionDescription : undefined}
      data-menu-hint={onMenuButton ? onMenuActionDescription : undefined}
      onKeyDown={(event) => {
        const handler = { y: onSecondaryButton, x: onOptionsButton, m: onMenuButton }[event.key.toLowerCase()];
        if (handler) { event.preventDefault(); handler(); }
      }}
    >
      {children}
    </button>
  );
}

export const DialogButtonPrimary = Button;

export function ModalRoot({ children, bAllowFullSize }: { children?: ReactNode; bAllowFullSize?: boolean }) {
  return (
    <div className="steam-modal-backdrop">
      {/* bAllowFullSize: Steam lets the window use most of the screen. */}
      <div className="steam-modal" style={bAllowFullSize ? { width: "min(657px, calc(100% - 32px))" } : undefined}>{children}</div>
    </div>
  );
}

// Steam's dropdown: a button as wide as its current value, then a solid triangle.
// A transparent native <select> covers it, so it still opens and can be chosen from.
function SteamSelect({ rgOptions, selectedOption, onChange, ariaLabel, style }: {
  rgOptions: { label: ReactNode; data: unknown }[];
  selectedOption: unknown;
  onChange?: (option: { data: unknown }) => void;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  const selected = rgOptions.find((option) => String(option.data) === String(selectedOption));
  return (
    <span className="steam-select" style={style}>
      <span className="steam-select-value">{selected?.label}</span>
      <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden><path d="M0 0h12L6 7z" fill="currentColor" /></svg>
      <select
        aria-label={ariaLabel}
        value={String(selectedOption)}
        onChange={(event) => {
          const option = rgOptions.find((item) => String(item.data) === event.target.value);
          if (option) onChange?.(option);
        }}
      >
        {rgOptions.map((option) => (
          <option key={String(option.data)} value={String(option.data)}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

export function Dropdown({
  rgOptions,
  selectedOption,
  onChange,
  menuLabel,
}: {
  rgOptions: { label: ReactNode; data: unknown }[];
  selectedOption: unknown;
  onChange?: (option: { data: unknown }) => void;
  menuLabel?: string;
}) {
  // On its own, Steam's dropdown fills its container (a labelled row sizes it to its value).
  return <SteamSelect rgOptions={rgOptions} selectedOption={selectedOption} onChange={onChange} ariaLabel={menuLabel} style={{ display: "flex", width: "100%" }} />;
}

export function DropdownItem({
  label,
  description,
  rgOptions,
  selectedOption,
  onChange,
  layout,
}: {
  label?: string;
  description?: ReactNode;
  rgOptions: { label: ReactNode; data: unknown }[];
  selectedOption: unknown;
  onChange: (option: { data: unknown }) => void;
  layout?: "below" | "inline";
}) {
  // Steam's Field puts the label beside the control unless asked for "below".
  const inline = layout !== "below";
  return (
    <>
    <label className="steam-field-label" style={inline ? { display: "flex", alignItems: "center", gap: 12 } : undefined}>
      {label}
      {/* Inline, Steam keeps the menu as wide as its value, right-aligned beside the label; below it, as wide as the field. */}
      <SteamSelect rgOptions={rgOptions} selectedOption={selectedOption} onChange={onChange} style={inline ? { marginTop: 0, marginLeft: "auto" } : { display: "flex", width: "100%", marginTop: 6 }} />
    </label>
    {/* Steam's Field prints its description under the row. */}
    {description && <div className="steam-field-description" style={{ marginTop: 4, color: "#8b929a", fontSize: "0.85em" }}>{description}</div>}
    </>
  );
}

export function TextField({
  label,
  value,
  onChange,
  bIsPassword,
  bShowClearAction,
  placeholder,
  onKeyDown,
  "aria-label": ariaLabel,
}: {
  "aria-label"?: string;
  placeholder?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  label?: string;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  bIsPassword?: boolean;
  bShowClearAction?: boolean;
}) {
  return (
    <label className={label ? "steam-field-label" : "steam-field-label steam-field-unlabelled"}>
      {label}
      <input type={bIsPassword ? "password" : "text"} value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} aria-label={ariaLabel} className={value ? "steam-input" : "steam-input Placeholder"} />
      {bShowClearAction && value && (
        <button
          type="button"
          aria-label="Clear"
          className="steam-button"
          onClick={() => onChange?.({ currentTarget: { value: "" } } as React.ChangeEvent<HTMLInputElement>)}
        >
          Clear
        </button>
      )}
    </label>
  );
}

export function ToggleField({ label, checked, onChange }: { label?: string; checked?: boolean; onChange?: (checked: boolean) => void }) {
  return (
    <label className="steam-toggle">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange?.(event.target.checked)} />
    </label>
  );
}

// Steam's gamepad buttons the plugin listens for; the mock maps "[" / "]" to L1 / R1.
export const GamepadButton = { BUMPER_LEFT: 5, BUMPER_RIGHT: 6 };
export enum NavEntryPositionPreferences { FIRST, LAST, MAINTAIN_X, MAINTAIN_Y, PREFERRED_CHILD }

export function Focusable({ style, children, ...rest }: { style?: CSSProperties; children?: ReactNode; [key: string]: unknown }) {
  const { "flow-children": flowChildren, noFocusRing: _noFocusRing, onActivate, onCancel: _onCancel, onButtonDown, onCancelButton, onCancelActionDescription: _onCancelActionDescription, navEntryPreferPosition: _navEntryPreferPosition, ...divProps } = rest;
  // "Escape" stands in for B where a Focusable handles it.
  const bumper = onButtonDown || onCancelButton
    ? (event: React.KeyboardEvent) => {
        if (event.key === "Escape" && onCancelButton) return (onCancelButton as () => void)();
        const button = { "[": GamepadButton.BUMPER_LEFT, "]": GamepadButton.BUMPER_RIGHT }[event.key];
        if (button && onButtonDown) (onButtonDown as (event: { detail: { button: number } }) => void)({ detail: { button } });
      }
    : undefined;
  const flowStyle = flowChildren === "right" ? { display: "flex", flexDirection: "row" as const } : flowChildren === "down" ? { display: "flex", flexDirection: "column" as const } : {};
  return (
    // Like Steam, onActivate makes the block itself a focus stop. The flow is
    // exposed so tests can check D-pad structure the geometric mock ignores.
    <div data-focusable="" data-flow-children={flowChildren as string | undefined} style={{ ...flowStyle, ...style }} tabIndex={onActivate ? 0 : undefined} onKeyDown={bumper} {...(divProps as React.HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}

export function Spinner({ style }: { style?: CSSProperties }) {
  const [tick] = useState(() => Math.random().toString(36).slice(2));
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        border: "2px solid #3d4450",
        borderTopColor: "#1a9fff",
        borderRadius: "50%",
        animation: `decky-mock-spin-${tick} 0.8s infinite linear`,
        verticalAlign: "middle",
        ...style,
      }}
    >
      <style>{`@keyframes decky-mock-spin-${tick} { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

export function ProgressBar({ indeterminate, nProgress }: { indeterminate?: boolean; nProgress?: number }) {
  const [tick] = useState(() => Math.random().toString(36).slice(2));
  return (
    <div style={{ height: 6, background: "#1a1d23", borderRadius: 3, overflow: "hidden" }}>
      <style>{`@keyframes decky-mock-indeterminate-${tick} { from { margin-left: -40%; } to { margin-left: 100%; } }`}</style>
      <div
        style={{
          height: "100%",
          width: indeterminate ? "40%" : `${nProgress ?? 0}%`,
          background: "#1a9fff",
          animation: indeterminate ? `decky-mock-indeterminate-${tick} 1.2s infinite linear` : undefined,
        }}
      />
    </div>
  );
}

export function ConfirmModal({
  strTitle,
  strDescription,
  strOKButtonText = "OK",
  strCancelButtonText = "Cancel",
  bAlertDialog,
  bDestructiveWarning,
  onOK,
  onCancel,
  closeModal,
  children,
}: {
  strTitle?: ReactNode;
  strDescription?: ReactNode;
  strOKButtonText?: ReactNode;
  strCancelButtonText?: ReactNode;
  bAlertDialog?: boolean;
  bDestructiveWarning?: boolean;
  onOK?: () => void;
  onCancel?: () => void;
  closeModal?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="steam-modal-backdrop">
      <div className="steam-modal">
        <h3 style={{ margin: "0 0 10px" }}>{strTitle}</h3>
        {strDescription && <div style={{ fontSize: 13, marginBottom: 16 }}>{strDescription}</div>}
        {children && <div style={{ marginBottom: 16 }}>{children}</div>}
        <div className="steam-modal-actions">
          {!bAlertDialog && (
            <button
              onClick={() => {
                onCancel?.();
                closeModal?.();
              }}
              className="steam-tab"
            >
              {strCancelButtonText}
            </button>
          )}
          <button
            onClick={() => {
              onOK?.();
              closeModal?.();
            }}
            className="steam-button"
          >
            {strOKButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}

let modalHost: HTMLDivElement | null = null;
export function showModal(node: React.ReactElement) {
  if (!modalHost) {
    modalHost = document.createElement("div");
    document.body.appendChild(modalHost);
  }
  const root = createRoot(modalHost);
  const close = () => root.unmount();
  root.render(createElement(node.type, { ...(node.props as object), closeModal: close }));
}

export const Navigation = {
  Navigate: (path: string) => window.dispatchEvent(new CustomEvent("decky-mock-navigate", { detail: path })),
  // ponytail: no history; "back" always lands on the Quick Access widget.
  NavigateBack: () => window.dispatchEvent(new CustomEvent("decky-mock-navigate", { detail: null })),
  NavigateToExternalWeb: (url: string) => window.open(url, "_blank"),
};

export const staticClasses = { Title: "decky-mock-title" };

// No Steam windows here: openExternalWeb() just opens the link (a new tab, above).
export const Router = { WindowStore: undefined };

// Steam's Tabs: a tab bar (L1 / R1, here "[" and "]", switch tabs) over the active
// tab's content, which scrolls on its own under the bar.
export function Tabs({ tabs, activeTab, onShowTab }: { tabs: { id: string; title: string; content: ReactNode }[]; activeTab: string; onShowTab: (id: string) => void; autoFocusContents?: boolean }) {
  const index = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab));
  const step = (delta: number) => onShowTab(tabs[(index + delta + tabs.length) % tabs.length].id);
  return (
    <div
      className="steam-tabs"
      onKeyDown={(event) => {
        if (event.key === "[" || event.key === "]") {
          event.preventDefault();
          step(event.key === "]" ? 1 : -1);
        }
      }}
    >
      <div className="steam-tab-bar" role="tablist">
        <span className="steam-tab-bumper" aria-hidden>L1</span>
        {tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={tab.id === tabs[index].id} className="steam-tab" onClick={() => onShowTab(tab.id)}>
            {tab.title}
          </button>
        ))}
        <span className="steam-tab-bumper" aria-hidden>R1</span>
      </div>
      <div className="steam-tab-content" role="tabpanel">{tabs[index]?.content}</div>
    </div>
  );
}
