const mongoose = require("mongoose");

const swineSchema = new mongoose.Schema({
  // ------------------- Basic Swine Info -------------------
  swine_id: { type: String, required: true, unique: true },
  registered_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  
  // manager_id is needed for the farm hierarchy and piglet ownership
  manager_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false }, 
  
  // farmer_id is optional for Master/Maintenance Boars
  farmer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: false }, 
  
  sex: { type: String, enum: ["Male", "Female"], required: true },
  color: { type: String },
  breed: { type: String },
  birth_date: { type: Date },
  
  // batch is optional for Maintenance/External Boars
  batch: { type: String, required: false }, 

  // Link piglet to a specific breeding cycle of the dam
  birth_cycle_number: { type: Number, required: false },

  // ------------------- Current Lifecycle State -------------------
  current_status: {
    type: String,
    enum: [
      "Monitoring (Day 1-30)", "Weaning", "3-Month Monitoring", "Final Selection", 
      "Open", "In-Heat", "Under Observation", "Bred", "Pregnant",
      "Farrowing", "Lactating", "Market-Ready", "Weight Limit (15-25kg)", "Culled/Sold",
      "Active", "Inactive", "Under Monitoring", "Routine Monitoring", "Completed",
      "To be Culled/Sold (Deformity)"
    ],
    default: "Monitoring (Day 1-30)" 
  },

  age_stage: { 
    type: String, 
    enum: [
      "piglet", 
      "growing", 
      "adult"
    ], 
    required: true, 
    default: "piglet" 
  },

  health_status: {
    type: String,
    enum: ["Healthy", "Sick", "Deceased (Before Weaning)", "Deceased"],
    default: "Healthy"
  },

  // ------------------- Lineage -------------------
  sire_id: { type: String }, 
  dam_id: { type: String },  

  // ------------------- Reproductive Cycles (For Females) -------------------
  breeding_cycles: [{
    cycle_number: { type: Number },
    heat_report_id: { type: mongoose.Schema.Types.ObjectId, ref: "HeatReport" },
    ai_record_id: { type: mongoose.Schema.Types.ObjectId, ref: "AIRecord" },
    
    estrus_date: { type: Date },           
    ai_service_date: { type: Date },       
    
    pregnancy_check_date: { type: Date }, 
    is_pregnant: { type: Boolean, default: false },
    farrowed: { type: Boolean, default: false }, 
    expected_farrowing_date: { type: Date },
    actual_farrowing_date: { type: Date },
    weaning_date: { type: Date }, 
    
    cycle_sire_id: { type: String },

    farrowing_results: {
      total_piglets: { type: Number, default: 0 },
      live_piglets: { type: Number, default: 0 }, 
      male_count: { type: Number, default: 0 },
      female_count: { type: Number, default: 0 },
      mortality_count: { type: Number, default: 0 }
    }
  }],

  // ------------------- Medical & Health Tracking -------------------
  medical_records: [{
    treatment_type: { 
      type: String, 
      enum: ["Vaccination", "Iron Injection", "Tail Docking", "Ear Notching", "Castration", "Deworming", "Antibiotic", "Vitamin", "Other"] 
    },
    medicine_name: { type: String },
    dosage: { type: String },
    admin_date: { type: Date, default: Date.now },
    remarks: { type: String },
    administered_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  }],

  // ------------------- Growth & Selection -------------------
  performance_records: [{
    stage: { 
      type: String, 
      enum: [
        "Registration", 
        "Maintenance Registration", 
        "Monitoring (Day 1-30)", 
        "Weaning", 
        "3-Month Monitoring", 
        "Final Selection", 
        "Market Check", 
        "Routine",
        "Open",
        "In-Heat",
        "Under Observation",
        "Bred",
        "Pregnant",
        "Farrowing",
        "Lactating",
        "Market-Ready",
        "Monthly Update",
        "Manual Weaning"
      ] 
    },
    record_date: { type: Date, default: Date.now },
    weight: { type: Number },
    body_length: { type: Number },
    heart_girth: { type: Number },
    teeth_count: { type: Number },
    leg_conformation: { type: String, default: "Normal" },
    teat_count: { type: Number }, 
    deformities: { type: [String], default: ["None"] },
    passed_selection: { type: Boolean, default: true },
    recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  }],

  // ------------------- Metadata -------------------
  is_external_boar: { type: Boolean, default: false }, 
  date_transfer: { type: Date },
  date_registered: { type: Date, default: Date.now },
  parity: { type: Number, default: 0 } 
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ------------------- Logic / Helpers -------------------

// 1. Lifecycle Phase Calculator (New)
swineSchema.virtual('lifecycle_phase').get(function() {
  if (this.age_stage !== 'piglet') return null;

  const now = new Date();
  const regDate = this.date_registered || this.createdAt;
  const daysDiff = Math.floor((now - regDate) / (1000 * 60 * 60 * 24));

  // Deformity check
  const latestPerf = this.performance_records?.[this.performance_records.length - 1];
  const hasDeformity = latestPerf?.deformities?.some(d => d !== "None" && d !== "");

  if (hasDeformity) return { phase: "To be Culled/Sold", daysLeft: 0, status: 'danger' };
  
  if (daysDiff <= 30) {
    return { phase: "Monitoring (Day 1-30)", daysLeft: 30 - daysDiff, status: 'info' };
  } else if (daysDiff <= 31) {
    return { phase: "Weaning", daysLeft: 0, status: 'warning' };
  } else if (daysDiff <= 121) { // 30 days + 3 months (90 days)
    return { phase: "3-Month Monitoring", daysLeft: 121 - daysDiff, status: 'primary' };
  } else {
    return { phase: "Final Selection", daysLeft: 0, status: 'success' };
  }
});

// Virtual to find all offspring
swineSchema.virtual('offspring', {
  ref: 'Swine',
  localField: 'swine_id',
  foreignField: 'dam_id'
});

// Virtual for Average Daily Gain (ADG)
swineSchema.virtual('current_adg').get(function() {
  if (!this.performance_records || this.performance_records.length < 2) return 0;
  const current = this.performance_records[this.performance_records.length - 1];
  const previous = this.performance_records[this.performance_records.length - 2];
  const weightDiff = current.weight - previous.weight;
  const daysDiff = (new Date(current.record_date) - new Date(previous.record_date)) / (1000 * 60 * 60 * 24);
  return daysDiff > 0 ? (weightDiff / daysDiff).toFixed(3) : 0;
});

// Virtual to calculate total mortality count
swineSchema.virtual('total_mortality_count').get(function() {
  if (!this.breeding_cycles) return 0;
  return this.breeding_cycles.reduce((acc, cycle) => {
    return acc + (cycle.farrowing_results?.mortality_count || 0);
  }, 0);
});

swineSchema.virtual('selection_suggestion').get(function() {
  if (!this.performance_records || this.performance_records.length === 0) return "No Growth Data";
  
  const latest = this.performance_records[this.performance_records.length - 1];
  const weight = latest.weight || 0;
  const hasDeformities = latest.deformities && latest.deformities.length > 0 && latest.deformities[0] !== "None";

  if (weight >= 15 && weight <= 25 && !hasDeformities) {
    return this.sex === "Female" ? "Retain for Breeding" : "Ready for Market";
  } else if (weight > 0) {
    return "Cull or Sell for Market";
  }
  return "Monitoring";
});

// Pre-save hook for gestation calculation
swineSchema.pre("save", function(next) {
  if (this.breeding_cycles && this.breeding_cycles.length > 0) {
    const latestCycle = this.breeding_cycles[this.breeding_cycles.length - 1];
    if (latestCycle.ai_service_date && !latestCycle.expected_farrowing_date) {
      const gestationDays = 114; 
      const farrowDate = new Date(latestCycle.ai_service_date);
      farrowDate.setDate(farrowDate.getDate() + gestationDays);
      latestCycle.expected_farrowing_date = farrowDate;
    }
  }
  next();
});

module.exports = mongoose.model("Swine", swineSchema);