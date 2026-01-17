/**
 * performance_helper.js
 * Centralizes the flowchart logic for Swine Selection and Monitoring.
 * Pipeline: Monitoring (Day 1-30) -> Weaned (Monitoring 3 Months) -> Final Selection.
 */

export const PerformanceHelper = {
    // Stage Constants to match the updated Swine.js schema
    STAGES: {
        MONITORING_30: "Monitoring (Day 1-30)",
        WEANED_3_MONTHS: "Weaned (Monitoring 3 Months)",
        FINAL_SELECTION: "Final Selection"
    },

    /**
     * Determines if growth updates are permitted based on the current age_stage.
     * Updates allowed during the first two phases to move them toward Final Selection.
     */
    isUpdateAllowed: (currentStage) => {
        const allowedStages = [
            "Monitoring (Day 1-30)",
            "Weaned (Monitoring 3 Months)",
            "piglet",  // Support legacy label
            "weaner",  // Support new label
            "growing"  // Support legacy label
        ];
        return allowedStages.includes(currentStage);
    },

    /**
     * Evaluates if a swine meets the "Final Selection" criteria from the flowchart.
     * Logic Updated: 
     * - Weight validation (15-25kg) is ONLY applied at Final Selection or Adult stage.
     * - Previous stages only check for deformities.
     * - Any Stage: Deformities = Cull suggestion.
     */
    getSelectionStatus: (swine, allDeformities = []) => {
        const latestPerf = swine.performance_records?.length > 0 
            ? swine.performance_records[swine.performance_records.length - 1] 
            : null;

        if (!latestPerf) {
            return { 
                canPromote: false, 
                suggestion: "No Data", 
                color: "#757575", 
                reason: "Growth records missing" 
            };
        }

        const weight = latestPerf.weight || 0;
        
        // ALIAS LOGIC: Normalize status for checking
        let currentStatus = swine.current_status || swine.age_stage;
        if (currentStatus === "piglet") currentStatus = "Monitoring (Day 1-30)";
        if (currentStatus === "weaner") currentStatus = "Weaned (Monitoring 3 Months)";
        
        const hasDeformityRecord = latestPerf.deformities && 
                                   latestPerf.deformities.length > 0 && 
                                   latestPerf.deformities[0] !== "None";
        
        // Match using swine_id (from DB) or swine_tag (from reproduction UI)
        const idToMatch = swine.swine_id || swine.swine_tag;
        const inGlobalDeformityList = allDeformities.some(d => (d.swine_tag === idToMatch));
        const hasDeformities = hasDeformityRecord || inGlobalDeformityList;

        // 1. Deformity Check (Universal Cull Suggestion - Applies to all stages)
        if (hasDeformities) {
            return {
                canPromote: false,
                suggestion: "⚠️ Suggest: Cull/Sell",
                color: "#c62828",
                bg: "#ffebee",
                reason: "Deformity detected"
            };
        }

        // 2. Decision Matrix
        // Weight validation (15-25kg) ONLY for Final Selection or Adult
        if (currentStatus === "Final Selection" || currentStatus === "adult") {
            const isWeightTargetMet = weight >= 15 && weight <= 25;
            
            if (isWeightTargetMet) {
                const label = swine.sex === "Female" ? "Retain for Breeding" : "Market Ready";
                return {
                    canPromote: false,
                    suggestion: `⭐ ${label}`,
                    color: "#2e7d32",
                    bg: "#e8f5e9",
                    reason: "Ideal weight for selection (15-25kg)"
                };
            } else {
                const isOverweight = weight > 25;
                return {
                    canPromote: false,
                    suggestion: isOverweight ? "⚠️ Suggest: Market (Overweight)" : "Monitoring (Underweight)",
                    color: isOverweight ? "#e67e22" : "#0288d1",
                    bg: isOverweight ? "#fff3e0" : "#e1f5fe",
                    reason: "Target weight: 15-25kg"
                };
            }
        }

        // 3. Logic for Preliminary Stages (Monitoring & Weaned)
        // At these stages, we only care that there are no deformities (checked above)
        const nextLabel = currentStatus === "Monitoring (Day 1-30)" ? "Weaning Phase" : "Final Selection";
        return {
            canPromote: true,
            suggestion: `✅ Ready for ${nextLabel}`,
            color: "#2e7d32",
            bg: "#e8f5e9",
            reason: "No deformities; proceed with monitoring"
        };
    },

    /**
     * Determines the next stage based on current age/status.
     */
    getNextStage: (currentStatus) => {
        // Alias legacy status for the transition
        let normalizedStatus = currentStatus;
        if (currentStatus === "piglet" || currentStatus === "Under Monitoring") {
            normalizedStatus = "Monitoring (Day 1-30)";
        } else if (currentStatus === "weaner") {
            normalizedStatus = "Weaned (Monitoring 3 Months)";
        }

        const flow = [
            "Monitoring (Day 1-30)",
            "Weaned (Monitoring 3 Months)",
            "Final Selection"
        ];
        
        const currentIndex = flow.indexOf(normalizedStatus);
        
        if (currentIndex !== -1 && currentIndex < flow.length - 1) {
            return flow[currentIndex + 1];
        }
        
        return currentStatus;
    }
};