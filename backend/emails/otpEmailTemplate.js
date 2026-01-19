module.exports = function otpEmailTemplate({ otp }) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>BreedIT Email Verification</title>
  </head>
  <body style="margin:0; padding:0; background:#f4f6f8; font-family: Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:40px 0;">
          <table width="480" style="background:#ffffff; border-radius:8px; padding:24px;">
            
            <!-- Logo -->
            <tr>
              <td align="center" style="padding-bottom:16px;">
               <img
                  src="https://res.cloudinary.com/dzwe878ps/image/upload/v1768866138/logo_a4umyp.png"
                  alt="breedIT"
                  width="120"
               />
              </td>
            </tr>

            <!-- Title -->
            <tr>
              <td align="center" style="font-size:20px; font-weight:bold; color:#333;">
                Verify your email
              </td>
            </tr>

            <!-- Message -->
            <tr>
              <td style="padding:16px 0; font-size:14px; color:#555;">
                Hello,<br /><br />
                Use the One-Time Password (OTP) below to verify your email address for
                <strong>breedIT</strong>.
              </td>
            </tr>

            <!-- OTP -->
            <tr>
              <td align="center" style="padding:16px 0;">
                <div style="
                  display:inline-block;
                  font-size:28px;
                  font-weight:bold;
                  letter-spacing:6px;
                  color:#2f855a;
                  background:#e6fffa;
                  padding:12px 24px;
                  border-radius:6px;
                ">
                  ${otp}
                </div>
              </td>
            </tr>

            <!-- Expiry -->
            <tr>
              <td style="font-size:13px; color:#777;">
                This OTP will expire in <strong>10 minutes</strong>.
              </td>
            </tr>

            <!-- Warning -->
            <tr>
              <td style="padding-top:16px; font-size:12px; color:#999;">
                If you did not request this code, please ignore this email.
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding-top:24px; font-size:11px; color:#aaa;" align="center">
                © ${new Date().getFullYear()} BreedIT. All rights reserved.
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};
