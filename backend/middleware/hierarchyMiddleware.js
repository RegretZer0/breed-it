exports.canCreateUser = (req, res, next) => {
  const creatorRole = req.user.role;
  const { role: newUserRole } = req.body;

  if (creatorRole !== "farm_manager") {
    return res.status(403).json({
      success: false,
      message: "Only Farm Managers can create users",
    });
  }

  if (!["encoder", "farmer"].includes(newUserRole)) {
    return res.status(403).json({
      success: false,
      message: "Farm Manager can only create Encoders or Farmers",
    });
  }

  next();
};
