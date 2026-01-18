module.exports = function requireSystemAdmin(req, res, next) {
  const user = req.session?.user;

  if (!user) {
    return res.redirect("/login");
  }

  if (user.role !== "system_admin") {
    return res.status(403).render("pages/auth/unauthorized", {
      page_title: "Unauthorized",
    });
  }

  next();
};
