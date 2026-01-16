const mongoose = require("mongoose");

const swineSchema = new mongoose.Schema({
  // ------------------- Basic Swine Info -------------------
  swine_id: { type: String, required: true, unique: true },
  registered_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  
  // UPDATED: farmer_id is now optional for Master/Maintenance Boars
  farmer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: false }, 
  
  sex: { type: String, enum: ["Male", "Female"], required: true },
  color: { type: String },
  breed: { type: String },
  birth_date: { type: Date },
  
  // UPDATED: batch is now optional for Maintenance/External Boars
  batch: { type: String, required: false }, 

  // ------------------- Current Lifecycle State -------------------
  current_status: {
    type: String,
    enum: [
      "1st Selection Ongoing", "Monitoring (Day 1-30)", "Weaned",
      "2nd Selection Ongoing", "Monitoring (3 Months)", "Open",
      "In-Heat", "Under Observation", "Bred", "Pregnant",
      "Farrowing", "Lactating", "Market-Ready", "Weight Limit (15-25kg)", "Culled/Sold",
      "Active", "Inactive" // Added for Maintenance Boars
    ],
    default: "1st Selection Ongoing"
  },

  age_stage: { 
    type: String, 
    enum: ["piglet", "growing", "adult"], 
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
    expected_farrowing_date: { type: Date },
    actual_farrowing_date: { type: Date },
    
    cycle_sire_id: { type: String },

    farrowing_results: {
      total_piglets: { type: Number, default: 0 },
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
      // UPDATED: Added Maintenance Registration to the enum
      enum: ["Registration", "Maintenance Registration", "1st Stage Selection", "2nd Stage Selection", "Market Check", "Routine"] 
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
  date_registered: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ------------------- Logic / Helpers -------------------

swineSchema.virtual('offspring', {
  ref: 'Swine',
  localField: 'swine_id',
  foreignField: 'dam_id'
});

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