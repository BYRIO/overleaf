export type CommandSelectionConfig = {
  [commandName: string]: { allowMulti?: boolean; maxSelection?: number }
}

export const DEFAULT_COMMAND_SELECTION_CONFIG: CommandSelectionConfig = {
  // natbib-like citation macros (allow multiple keys by default)
  citet: { allowMulti: true },
  citep: { allowMulti: true },
  citealt: { allowMulti: true },
  citealp: { allowMulti: true },
  // author and year macros
  citeauthor: { allowMulti: true },
  citeyear: { allowMulti: true },
  citeyearpar: { allowMulti: true },
  // Example for a hypothetical single-key command:
  // singlecite: { allowMulti: false, maxSelection: 1 },
}
