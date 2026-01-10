module.exports = (req, res, next) => {
  const user = req.session?.user;

  if (!user) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }

  if (user.role !== "system_admin") {
    return res.status(403).json({ success: false, message: "Admins only" });
  }

  next();
};
