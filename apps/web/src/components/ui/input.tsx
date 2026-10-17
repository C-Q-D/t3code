/** Owns the shared input well; native and Base UI inputs use the same presentation. */
"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "~/lib/utils";

/** Preserves native sizing and the unstyled composition path used by InputGroup. */
type InputProps = Omit<InputPrimitive.Props & React.RefAttributes<HTMLInputElement>, "size"> & {
  size?: "sm" | "compact" | "default" | "lg" | "settings" | "stepper" | number;
  /** Monospace with tabular digits, for paths, commands, colors and numbers. */
  font?: "default" | "mono";
  unstyled?: boolean;
  nativeInput?: boolean;
};

/** Renders a pill input; numeric size values still set the native character width. */
function Input({
  className,
  size = "default",
  font = "default",
  unstyled = false,
  nativeInput = false,
  ...props
}: InputProps) {
  const inputClassName = cn(
    "h-9.5 w-full min-w-0 rounded-[inherit] bg-transparent px-3.5 text-control outline-none caret-message-action placeholder:text-placeholder [transition:background-color_5000000s_ease-in-out_0s]",
    !unstyled &&
      "enabled:not-focus:hover:placeholder:text-muted-foreground disabled:placeholder:text-fg-icon-disabled",
    size === "compact" && "h-7 px-2.5 text-secondary-copy",
    size === "sm" && "h-7.5 px-2.5",
    size === "lg" && "h-10",
    // SettingsPage8a M2 path inputs and day stepper share the 32px control geometry.
    size === "settings" && "h-8 px-3 text-secondary-copy",
    size === "stepper" && "h-6.5 px-0 text-center text-secondary-copy-large",
    props.type === "search" &&
      "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
    // Number fields are typed into; browser spin buttons crowd narrow fields and step by 1.
    props.type === "number" &&
      "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    props.type === "file" &&
      "text-muted-foreground file:me-3 file:bg-transparent file:font-medium file:text-foreground file:text-sm",
  );
  let inputElement: React.ReactElement;

  if (nativeInput) {
    const { style, onValueChange: _onValueChange, ...nativeInputProps } = props;
    const nativeStyle = typeof style === "function" ? undefined : style;

    inputElement = (
      <input
        className={inputClassName}
        data-slot="input"
        size={typeof size === "number" ? size : undefined}
        style={nativeStyle}
        {...(nativeInputProps as React.ComponentProps<"input">)}
      />
    );
  } else {
    inputElement = (
      <InputPrimitive
        className={inputClassName}
        data-slot="input"
        size={typeof size === "number" ? size : undefined}
        {...props}
      />
    );
  }

  return (
    <span
      className={
        cn(
          !unstyled &&
            "relative inline-flex w-full rounded-full border-0 bg-input text-foreground shadow-well-control transition-shadow not-has-disabled:not-focus-within:hover:bg-well-surface not-has-disabled:not-focus-within:hover:shadow-well-hover focus-within:bg-input focus-within:shadow-input-focus-depth focus-within:inset-shadow-focus has-[input:active]:bg-input has-[input:active]:shadow-well-editing has-aria-invalid:shadow-outline-danger has-disabled:bg-input-disabled has-disabled:text-fg-icon-disabled has-disabled:shadow-input-disabled-edge",
          font === "mono" && "font-mono tabular-nums",
          className,
        ) || undefined
      }
      data-size={size}
      data-slot="input-control"
    >
      {inputElement}
    </span>
  );
}

export { Input, type InputProps };
