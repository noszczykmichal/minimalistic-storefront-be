export class SessionUserDto {
  firstName: string;
  email: string;
}

export class SessionResponseDto {
  accessToken: string;
  user: SessionUserDto;
  accessTokenExpiresAt: number;
}

export class LogoutResponseDto {
  message: string;
}
