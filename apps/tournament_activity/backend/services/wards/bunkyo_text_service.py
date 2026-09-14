"""
文京区専用 テキスト申込書サービス

文京区は申込書をテキストで送付する運用のため、Excelではなくテキストを生成する。
墨田区（sumida_text_service）と同じ枠組みだが、出力項目は氏名と年齢だけで、
生年月日・電話番号・クラブ名は出さない。

団体戦（classification=1、申込1件＝1チーム）:
    ■一般男子
    山田 太郎　34
    佐藤 次郎　28

    同じ種別に複数チームある場合はチームごとに別ブロックで出す。

個人戦（classification=1以外、申込1件＝1ペア）:
    ■一般女子
    ①
    鈴木 花子　25
    田中 桃子　31

    ②
    山本 桜　29
    中村 彩乃　22

年齢は大会当日時点で計算する（区大会の基準日。広域大会の 4/1 基準とは異なる）。
種別ごとに開催日が異なる統合レコードでは、その申込が属する開催日を基準にする
（arakawa_excel_service と同じ考え方）。
"""
from datetime import datetime, date
from typing import Dict, List, Optional


# 個人戦でペアに振る丸数字
CIRCLED_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"


def _circled(n: int) -> str:
    """1始まりの連番を丸数字にする（⑳超は (n) 表記にフォールバック）"""
    if 1 <= n <= len(CIRCLED_NUMBERS):
        return CIRCLED_NUMBERS[n - 1]
    return f"({n})"


class BunkyoTextService:
    """文京区専用のテキスト申込書生成サービス"""

    ward_id = 5
    ward_name = "文京区"

    def _to_date(self, value) -> Optional[date]:
        """DATE/DATETIME/文字列を date に正規化（不正値は None）"""
        if not value:
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        try:
            return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
        except ValueError:
            return None

    def _calc_age(self, birth_date, ref_date) -> Optional[int]:
        """ref_date時点での年齢を計算（誕生日前なら1引く）"""
        bd = self._to_date(birth_date)
        rd = self._to_date(ref_date)
        if bd is None or rd is None:
            return None
        age = rd.year - bd.year
        if (rd.month, rd.day) < (bd.month, bd.day):
            age -= 1
        return age

    def _format_type_sex(self, type_: Optional[str], sex: Optional[int]) -> str:
        """種別と性別を結合（例: 一般男子）"""
        if type_ is None:
            return ""
        if sex is None:
            return str(type_)
        return f"{type_}{'男子' if sex == 0 else '女子'}"

    def _ref_date(self, tournament: Dict, registration: Dict):
        """年齢の基準日。統合レコードでは申込が属する開催日を優先する"""
        return registration.get("source_tournament_date") or tournament.get("tournament_date")

    def _player_line(self, player: Dict, ref_date) -> str:
        """選手1名分の行（フルネーム＋全角スペース＋年齢）

        生年月日が未登録で年齢が出せない場合は氏名だけを返す。
        """
        name = str(player.get("player_name") or "").strip()
        age = self._calc_age(player.get("birth_date"), ref_date)
        return f"{name}　{age}" if age is not None else name

    def build_team_text(self, tournament: Dict, registration: Dict) -> str:
        """団体戦の申込1件（=1チーム）分のテキストを生成"""
        type_sex = self._format_type_sex(registration.get("type"), registration.get("sex"))
        ref_date = self._ref_date(tournament, registration)

        lines: List[str] = [f"■{type_sex}" if type_sex else "■"]
        for player in registration.get("members", []):
            if not player:
                continue
            lines.append(self._player_line(player, ref_date))
        return "\n".join(lines).rstrip()

    def build_individual_text(self, tournament: Dict, type_sex: str, registrations: List[Dict]) -> str:
        """個人戦の1種別分のテキストを生成（ペアごとに丸数字を振る）"""
        lines: List[str] = [f"■{type_sex}" if type_sex else "■"]
        for idx, reg in enumerate(registrations, start=1):
            lines.append(_circled(idx))
            ref_date = self._ref_date(tournament, reg)
            for player in reg.get("members", []):
                if not player:
                    continue
                lines.append(self._player_line(player, ref_date))
            lines.append("")
        return "\n".join(lines).rstrip()

    def build_texts(self, tournament: Dict, registrations: List[Dict]) -> List[str]:
        """
        全申込分のテキストブロックをリストで生成

        先頭に大会名のヘッダーブロックを1つ置き、以降を申込様式どおりの
        「■種別」ブロックにする（Discordへ送るときにどの大会か分かるようにするため）。

        Args:
            tournament: 大会情報（tournament_mst）
            registrations: 'members' に選手dictのリストを含む申込データのリスト

        Returns:
            テキストブロックのリスト（Discordメッセージ単位）
        """
        texts: List[str] = [f"【文京区 申込書】{tournament.get('tournament_name', '')}".rstrip()]

        if tournament.get("classification") == 1:
            # 団体戦: 1申込=1チームなので、チームごとにブロックを作る
            for reg in registrations:
                block = self.build_team_text(tournament, reg)
                if block:
                    texts.append(block)
            return texts

        # 個人戦: 種別（性別→種別）ごとにまとめ、男子→女子の順で出力する
        groups: Dict[tuple, List[Dict]] = {}
        for reg in registrations:
            key = (
                reg.get("sex") if reg.get("sex") is not None else 0,
                str(reg.get("type") or ""),
            )
            groups.setdefault(key, []).append(reg)

        for sex, type_ in sorted(groups.keys()):
            regs = sorted(groups[(sex, type_)], key=lambda r: r.get("registration_id") or 0)
            block = self.build_individual_text(tournament, self._format_type_sex(type_, sex), regs)
            if block:
                texts.append(block)
        return texts
