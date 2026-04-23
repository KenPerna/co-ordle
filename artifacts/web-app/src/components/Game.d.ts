import type { FC } from "react";

export interface GameProps {
  secretWord?: string;
}

export const Game: FC<GameProps>;
