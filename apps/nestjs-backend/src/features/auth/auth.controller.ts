import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  IAddPasswordRo,
  IChangePasswordRo,
  IResetPasswordRo,
  ISendResetPasswordEmailRo,
  ISignup,
  addPasswordRoSchema,
  changePasswordRoSchema,
  resetPasswordRoSchema,
  sendResetPasswordEmailRoSchema,
  signupSchema,
} from '@teable/openapi';
import { Response, Request } from 'express';
import { FeatureConfig, IFeatureConfig, resolveFeatureAccess } from '../../configs/feature.config';
import { AUTH_SESSION_COOKIE_NAME } from '../../const';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LocalAuthGuard } from './guard/local-auth.guard';
import { pickUserMe } from './utils';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @FeatureConfig() private readonly featureConfig: IFeatureConfig
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @HttpCode(200)
  @Post('signin')
  async signin(@Req() req: Express.Request) {
    return req.user;
  }

  @Post('signout')
  @HttpCode(200)
  async signout(@Req() req: Express.Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.signout(req);
    res.clearCookie(AUTH_SESSION_COOKIE_NAME);
  }

  @Public()
  @Post('signup')
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) body: ISignup,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Express.Request
  ) {
    const user = pickUserMe(await this.authService.signup(body.email, body.password));
    // set cookie, passport login
    await new Promise<void>((resolve, reject) => {
      req.login(user, (err) => (err ? reject(err) : resolve()));
    });
    return user;
  }

  @Get('/user/me')
  async me(@Req() request: Express.Request) {
    const user = request.user!;
    // Instance-level feature gating rides along with the existing user
    // payload rather than a separate endpoint, so the frontend gets it from
    // the useSession() context it already reads.
    const access = resolveFeatureAccess(
      (user as { email?: string }).email,
      this.featureConfig
    );
    return { ...user, ...access, _session_ticket: request.sessionID };
  }

  @Patch('/change-password')
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordRoSchema)) changePasswordRo: IChangePasswordRo,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    await this.authService.changePassword(changePasswordRo);
    await this.authService.signout(req);
    res.clearCookie(AUTH_SESSION_COOKIE_NAME);
  }

  @Post('/send-reset-password-email')
  @Public()
  async sendResetPasswordEmail(
    @Body(new ZodValidationPipe(sendResetPasswordEmailRoSchema)) body: ISendResetPasswordEmailRo
  ) {
    return this.authService.sendResetPasswordEmail(body.email);
  }

  @Post('/reset-password')
  @Public()
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordRoSchema)) body: IResetPasswordRo) {
    return this.authService.resetPassword(body.code, body.password);
  }

  @Post('/add-password')
  async addPassword(@Body(new ZodValidationPipe(addPasswordRoSchema)) body: IAddPasswordRo) {
    return this.authService.addPassword(body.password);
  }
}
