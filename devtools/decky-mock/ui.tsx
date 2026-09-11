// Minimal visual stand-in for @decky/ui, for local browser preview only.
// The real components are scraped at runtime from Steam's own webpack bundle
// (via findModuleExport), so nothing here is pixel-accurate — this exists to
// exercise layout and logic, not to review visuals.
import React, { createElement, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

export function PanelSection({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <section style={{ margin: "0 0 12px", padding: "10px 12px", background: "#23262e", borderRadius: 6 }}>
      {title && <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "#8b929a", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</h3>}
      {children}
    </section>
  );
}

export function PanelSectionRow({ children }: { children?: ReactNode }) {
  return <div style={{ margin: "6px 0", fontSize: 13, color: "#c6d4df" }}>{children}</div>;
}

export function ButtonItem({
  layout,
  onClick,
  disabled,
  children,
}: {
  layout?: string;
  onClick?: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: layout === "below" ? "block" : "inline-block",
        width: layout === "below" ? "100%" : undefined,
        margin: layout === "below" ? "4px 0" : 0,
        padding: "8px 10px",
        background: disabled ? "#2a2d34" : "#2a475e",
        color: disabled ? "#666" : "#fff",
        border: "1px solid #3d4450",
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13,
        textAlign: "left",
      }}
    >
      {children}
    </button>
  );
}

export function DropdownItem({
  label,
  rgOptions,
  selectedOption,
  onChange,
}: {
  label?: string;
  rgOptions: { label: ReactNode; data: unknown }[];
  selectedOption: unknown;
  onChange: (option: { data: unknown }) => void;
}) {
  return (
    <label style={{ display: "block", fontSize: 12, color: "#8b929a" }}>
      {label}
      <select
        value={String(selectedOption)}
        onChange={(event) => {
          const option = rgOptions.find((item) => String(item.data) === event.target.value);
          if (option) onChange(option);
        }}
        style={{ display: "block", width: "100%", marginTop: 4, padding: 6, background: "#1a1d23", color: "#fff", border: "1px solid #3d4450", borderRadius: 4 }}
      >
        {rgOptions.map((option) => (
          <option key={String(option.data)} value={String(option.data)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextField({ label, value, onChange }: { label?: string; value?: string; onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label style={{ display: "block", fontSize: 12, color: "#8b929a" }}>
      {label}
      <input
        value={value}
        onChange={onChange}
        style={{ display: "block", width: "100%", marginTop: 4, padding: 6, background: "#1a1d23", color: "#fff", border: "1px solid #3d4450", borderRadius: 4, boxSizing: "border-box" }}
      />
    </label>
  );
}

export function ToggleField({ label, checked, onChange }: { label?: string; checked?: boolean; onChange?: (checked: boolean) => void }) {
  return (
    <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, margin: "6px 0" }}>
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange?.(event.target.checked)} />
    </label>
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
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
      <div style={{ background: "#23262e", padding: 20, borderRadius: 8, width: 360, color: "#e6ecf1", fontFamily: "sans-serif" }}>
        <h3 style={{ margin: "0 0 10px" }}>{strTitle}</h3>
        <div style={{ fontSize: 13, marginBottom: 16 }}>{strDescription}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {!bAlertDialog && (
            <button
              onClick={() => {
                onCancel?.();
                closeModal?.();
              }}
              style={{ padding: "6px 12px", background: "transparent", color: "#c6d4df", border: "1px solid #3d4450", borderRadius: 4 }}
            >
              {strCancelButtonText}
            </button>
          )}
          <button
            onClick={() => {
              onOK?.();
              closeModal?.();
            }}
            style={{ padding: "6px 12px", background: bDestructiveWarning ? "#c0392b" : "#1a9fff", color: "#fff", border: "none", borderRadius: 4 }}
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
  NavigateToExternalWeb: (url: string) => window.open(url, "_blank"),
};

export const staticClasses = { Title: "decky-mock-title" };

export function Tabs({
  tabs,
  activeTab,
  onShowTab,
}: {
  tabs: { id: string; title: string; content: ReactNode }[];
  activeTab: string;
  onShowTab: (tab: string) => void;
}) {
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: "1px solid #262a31" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onShowTab(tab.id)}
            style={{
              padding: "8px 14px",
              background: "transparent",
              color: tab.id === active?.id ? "#fff" : "#8b929a",
              border: "none",
              borderBottom: tab.id === active?.id ? "2px solid #1a9fff" : "2px solid transparent",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {tab.title}
          </button>
        ))}
      </div>
      {active?.content}
    </div>
  );
}
