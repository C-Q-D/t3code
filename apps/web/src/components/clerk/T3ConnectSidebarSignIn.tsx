/** Presents sidebar account entry points; Clerk retains ownership of authentication and account actions. */
import { t } from "~/i18n";
import { UserButton, useAuth } from "@clerk/react";
import { CloudIcon, LogInIcon, UserRoundIcon } from "lucide-react";

import { hasCloudPublicConfig } from "../../cloud/publicConfig";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { T3_CONNECT_ACCOUNT_PAGES } from "./T3ConnectAccountPages";
import { useT3ConnectAuthPrompt } from "./useT3ConnectAuthPrompt";

/**
 * Renders the settings account row without introducing an authentication path.
 * @param onSignIn Existing Clerk sign-in action; omission keeps the decorative row disabled.
 * @returns The T3 Connect row, labelled with the real sign-in action when available.
 */
function SettingsConnectCard({ onSignIn }: { onSignIn?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onSignIn}
      onClick={onSignIn}
      className="flex h-9.5 w-full items-center gap-2.5 rounded-compact-row bg-settings-connect px-3 text-left text-secondary-copy-large leading-normal text-foreground shadow-settings-connect-row outline-none enabled:cursor-pointer enabled:hover:bg-secondary focus-visible:inset-shadow-focus disabled:text-secondary-label"
    >
      <CloudIcon aria-hidden="true" className="size-3.75 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate font-semibold">
        {t.settings.sidebarNav.connectTitle}
      </span>
      <span className="text-secondary-copy leading-normal text-code-foreground">
        {t.settings.sidebarNav.signIn}
      </span>
    </button>
  );
}

/** Uses an anonymous silhouette where the design's sample initials have no real account behind them. */
function SettingsAvatarPlaceholder() {
  return (
    <span
      role="img"
      aria-label={t.settings.sidebarNav.accountAvatar}
      className="flex size-7.5 shrink-0 items-center justify-center rounded-full bg-settings-avatar text-foreground shadow-settings-avatar-edge"
    >
      <UserRoundIcon aria-hidden="true" className="size-4" />
    </span>
  );
}

/**
 * Keeps the existing sign-in visibility when Clerk is configured.
 * @param variant Defaults to the thread sidebar; settings adds a disabled row without cloud configuration.
 * @returns The account entry point, or null while Clerk loads or the account is already signed in.
 */
export function T3ConnectSidebarSignIn({
  variant = "default",
}: {
  variant?: "default" | "settings";
}) {
  if (!hasCloudPublicConfig()) return variant === "settings" ? <SettingsConnectCard /> : null;

  return <ConfiguredT3ConnectSidebarSignIn variant={variant} />;
}

/**
 * Shows the real Clerk account control when signed in.
 * @param variant Defaults to the thread sidebar; settings reserves an anonymous avatar otherwise.
 * @returns The account menu trigger, a decorative settings avatar, or null in the default signed-out state.
 */
export function T3ConnectSidebarAvatar({
  variant = "default",
}: {
  variant?: "default" | "settings";
}) {
  if (!hasCloudPublicConfig()) return variant === "settings" ? <SettingsAvatarPlaceholder /> : null;

  return <ConfiguredT3ConnectSidebarAvatar variant={variant} />;
}

/**
 * Preserves Clerk's account menu and profile pages while selecting the avatar presentation.
 * @param variant Settings uses a 30px circular avatar; default retains the thread sidebar appearance.
 * @returns The real account control, or the variant's placeholder when no account is ready.
 */
function ConfiguredT3ConnectSidebarAvatar({ variant }: { variant: "default" | "settings" }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded || !isSignedIn)
    return variant === "settings" ? <SettingsAvatarPlaceholder /> : null;

  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox:
            variant === "settings" ? "size-7.5 rounded-full shadow-settings-avatar-edge" : "size-7",
          userButtonTrigger:
            variant === "settings"
              ? "rounded-full p-0 focus-visible:inset-shadow-focus"
              : "mb-1! rounded-lg! p-1! hover:bg-sidebar-row-hover!",
        },
      }}
    >
      {T3_CONNECT_ACCOUNT_PAGES.map((page) => (
        <UserButton.UserProfilePage
          key={page.url}
          label={page.label}
          labelIcon={page.icon}
          url={page.url}
        >
          {page.content}
        </UserButton.UserProfilePage>
      ))}
    </UserButton>
  );
}

/**
 * Opens the existing Clerk authentication flow only on user action.
 * @param variant Selects the settings account row or the default thread-sidebar sign-in control.
 * @returns The sign-in entry point, or null until loaded and signed out.
 */
function ConfiguredT3ConnectSidebarSignIn({ variant }: { variant: "default" | "settings" }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { openAuthPrompt } = useT3ConnectAuthPrompt();

  if (!isLoaded || isSignedIn) return null;

  if (variant === "settings") {
    return <SettingsConnectCard onSignIn={openAuthPrompt} />;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={openAuthPrompt}>
          <LogInIcon />
          <span>{t.account.clerk.signIn}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
