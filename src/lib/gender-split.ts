// Campaign-wide "split results by gender" switch.
//
// Most races award separately to men and women, so every winners board and the
// AWARD label are scoped to (gender, age group). Some events don't race the
// genders separately at all — a dog race, for example, where every entrant is
// registered under the same gender tag — and there the split only produces one
// full board next to one permanently empty one.
//
// Turning the switch off merges the two boards into a single combined column
// per age group, and makes the Overall / age-group award ranks come from the
// whole field instead of per gender.

export interface GenderSplitConfig {
    /** Undefined means on — campaigns saved before the switch existed keep the
     *  male/female split they've always had. Only an explicit `false` merges. */
    genderSplitEnabled?: boolean;
}

/** Whether this campaign splits results into male / female boards. */
export function isGenderSplitEnabled(config: GenderSplitConfig | null | undefined): boolean {
    return config?.genderSplitEnabled !== false;
}
