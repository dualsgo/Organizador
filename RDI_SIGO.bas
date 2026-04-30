Attribute VB_Name = "RDI_SIGO"
Option Explicit

' ================================================================
'  RDI SIGO – Organizador de Interna??es
'  Importe este arquivo no Editor VBA (Alt+F11 > Arquivo > Importar)
'  Depois execute: AdicionarBotoes
' ================================================================

Const SHEET_DATA As String = "RDI Dashboard"
Const META_ROW   As Long   = 1   ' linha reservada para metadados

' ---------------------------------------------------------------
'  PONTO DE ENTRADA – abre di?logo e carrega CSV
' ---------------------------------------------------------------
Sub AbrirRDI()
    Dim csvPath As String
    csvPath = Application.GetOpenFilename( _
        "Arquivos CSV (*.csv),*.csv", 1, "Selecionar RDI SIGO", , False)
    If csvPath = "False" Then Exit Sub
    Call CarregarCSV(csvPath)
End Sub

' ---------------------------------------------------------------
'  CARREGAR CSV na aba Dashboard
' ---------------------------------------------------------------
Sub CarregarCSV(csvPath As String)
    Dim fNum    As Integer
    Dim allText As String
    Dim linhas()As String
    Dim i As Long, j As Long

    Application.ScreenUpdating  = False
    Application.Calculation     = xlCalculationManual

    ' -- Ler arquivo (encoding latin-1 / ANSI) ------------------
    fNum = FreeFile
    Open csvPath For Input As #fNum
        allText = Input(LOF(fNum), fNum)
    Close #fNum

    ' -- Detectar delimitador -----------------------------------
    Dim delim As String
    Dim s2000 As String: s2000 = Left(allText, 2000)
    If Len(s2000) - Len(Replace(s2000, ";", "")) > _
       Len(s2000) - Len(Replace(s2000, ",", "")) Then
        delim = ";"
    Else
        delim = ","
    End If

    ' -- Dividir em linhas --------------------------------------
    allText = Replace(Replace(allText, vbCrLf, vbLf), vbCr, vbLf)
    linhas  = Split(allText, vbLf)

    ' -- Encontrar linha de cabe?alho (onde tem SENHA) ----------
    Dim hIdx As Long: hIdx = 0
    For i = 0 To Application.Min(14, UBound(linhas))
        If InStr(1, UCase(linhas(i)), "SENHA") > 0 Then
            hIdx = i: Exit For
        End If
    Next i

    ' -- Preparar aba ------------------------------------------
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(SHEET_DATA)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Sheets.Add( _
            After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        ws.Name = SHEET_DATA
    Else
        ws.Cells.Clear
        If ws.AutoFilterMode Then ws.AutoFilterMode = False
    End If

    ' -- Parsear cabe?alho e descobrir n? de colunas ?teis -----
    Dim hdrs()  As String
    hdrs = SplitCSVLine(linhas(hIdx), delim)
    Dim nCols As Long: nCols = 0
    For j = 0 To UBound(hdrs)
        If Trim(hdrs(j)) <> "" Then nCols = j + 1
    Next j
    If nCols = 0 Then nCols = UBound(hdrs) + 1
    If nCols > 30 Then nCols = 30

    ' -- Linha 1: metadados (oculta visualmente) ----------------
    ws.Cells(1, 1).Value = csvPath          ' caminho completo
    ws.Cells(1, 2).Value = delim            ' delimitador
    ws.Cells(1, 3).Value = nCols            ' n? colunas uteis
    ws.Rows(1).Font.Color    = RGB(17, 24, 39)
    ws.Rows(1).Interior.Color = RGB(17, 24, 39)
    ws.Rows(1).RowHeight = 4

    ' -- Linha 2: cabe?alho ------------------------------------
    For j = 0 To nCols - 1
        ws.Cells(2, j + 1).Value = Trim(hdrs(j))
    Next j

    ' -- Linhas de dados ---------------------------------------
    Dim dataRow As Long: dataRow = 3
    Dim campos() As String
    For i = hIdx + 1 To UBound(linhas)
        If Len(Trim(linhas(i))) = 0 Then GoTo skip
        campos = SplitCSVLine(linhas(i), delim)
        If UBound(campos) < 0 Then GoTo skip
        Dim c0 As String: c0 = Trim(campos(0))
        If c0 = "" Or Left(c0, 2) = "*=" Then GoTo skip

        For j = 0 To Application.Min(nCols - 1, UBound(campos))
            ws.Cells(dataRow, j + 1).Value = Trim(campos(j))
        Next j
        dataRow = dataRow + 1
skip:
    Next i

    Dim lastRow As Long: lastRow = dataRow - 1

    ' -- Formatar ----------------------------------------------
    Call FormatarSheet(ws, lastRow, nCols)

    ' -- AutoFilter + Freeze -----------------------------------
    ws.Range(ws.Cells(2, 1), ws.Cells(lastRow, nCols)).AutoFilter
    ws.Activate
    ws.Cells(3, 1).Select
    ActiveWindow.FreezePanes = True
    ws.Cells(3, 1).Select

    Application.ScreenUpdating = True
    Application.Calculation    = xlCalculationAutomatic

    MsgBox Chr(10) & "  " & (lastRow - 2) & " registros carregados!" & Chr(10) & _
           "  Edite nas c?lulas e use [Salvar CSV] para gravar." & Chr(10), _
           vbInformation, "RDI SIGO"
End Sub

' ---------------------------------------------------------------
'  FORMATAR planilha com visual escuro
' ---------------------------------------------------------------
Sub FormatarSheet(ws As Worksheet, lastRow As Long, nCols As Long)
    ' Fundo geral
    ws.Cells.Interior.Color = RGB(17, 24, 39)
    ws.Cells.Font.Color     = RGB(226, 232, 240)
    ws.Cells.Font.Name      = "Calibri"

    ' Cabe?alho linha 2
    With ws.Range(ws.Cells(2, 1), ws.Cells(2, nCols))
        .Interior.Color     = RGB(30, 58, 138)
        .Font.Color         = RGB(147, 197, 253)
        .Font.Bold          = True
        .Font.Size          = 10
        .RowHeight          = 26
        .VerticalAlignment  = xlVAlignCenter
    End With

    ' Dados com faixas alternadas
    Dim i As Long
    For i = 3 To lastRow
        With ws.Range(ws.Cells(i, 1), ws.Cells(i, nCols))
            If i Mod 2 = 0 Then
                .Interior.Color = RGB(17, 24, 39)
            Else
                .Interior.Color = RGB(30, 41, 59)
            End If
            .RowHeight = 20
            .VerticalAlignment = xlVAlignCenter
        End With
    Next i

    ' Bordas
    With ws.Range(ws.Cells(2, 1), ws.Cells(lastRow, nCols)).Borders
        .LineStyle = xlContinuous
        .Color     = RGB(51, 65, 85)
        .Weight    = xlThin
    End With

    ' Larguras das primeiras colunas (formato SIGO)
    Dim larguras As Variant
    larguras = Array(14, 28, 32, 18, 14, 10, 50, 16, 60)
    For i = 0 To Application.Min(UBound(larguras), nCols - 1)
        ws.Columns(i + 1).ColumnWidth = larguras(i)
    Next i

    ' Wrap text nas colunas de pend?ncia e status
    If nCols >= 7 Then ws.Columns(7).WrapText = True
    If nCols >= 9 Then ws.Columns(9).WrapText = True
End Sub

' ---------------------------------------------------------------
'  SALVAR de volta no CSV original (ou c?pia)
' ---------------------------------------------------------------
Sub SalvarCSV()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(SHEET_DATA)
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "Nenhum dado carregado. Use [Abrir RDI] primeiro.", vbExclamation: Exit Sub
    End If

    Dim csvPath As String: csvPath = ws.Cells(1, 1).Value
    Dim delim   As String: delim   = ws.Cells(1, 2).Value
    Dim nCols   As Long:   nCols   = CLng(ws.Cells(1, 3).Value)

    If delim = "" Then delim = ";"
    If nCols = 0  Then nCols = 9

    ' Perguntar destino
    Dim resp As Integer
    Dim nomeCurto As String
    nomeCurto = Mid(csvPath, InStrRev(csvPath, "\") + 1)

    resp = MsgBox("Onde salvar?" & vbCrLf & vbCrLf & _
                  "SIM    = Sobrescrever original: " & nomeCurto & vbCrLf & _
                  "N?O   = Criar c?pia (_editado.csv)" & vbCrLf & _
                  "CANCELAR = Abortar", _
                  vbYesNoCancel + vbQuestion, "RDI SIGO – Salvar")

    If resp = vbCancel Then Exit Sub

    Dim savePath As String
    If resp = vbYes Then
        savePath = csvPath
    Else
        savePath = Left(csvPath, InStrRev(csvPath, ".") - 1) & "_editado.csv"
    End If

    ' Escrever arquivo
    Dim fNum As Integer: fNum = FreeFile
    Open savePath For Output As #fNum

    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

    Dim i As Long, j As Long
    For i = 2 To lastRow   ' linha 2 = cabe?alho, 3+ = dados
        Dim rowStr As String: rowStr = ""
        For j = 1 To nCols
            Dim cellVal As String
            cellVal = CStr(ws.Cells(i, j).Value)
            ' Escapar se necess?rio
            If InStr(cellVal, delim) > 0 Or InStr(cellVal, Chr(34)) > 0 _
               Or InStr(cellVal, vbLf) > 0 Then
                cellVal = Chr(34) & Replace(cellVal, Chr(34), Chr(34) & Chr(34)) & Chr(34)
            End If
            rowStr = rowStr & cellVal
            If j < nCols Then rowStr = rowStr & delim
        Next j
        Print #fNum, rowStr
    Next i

    Close #fNum
    MsgBox "Arquivo salvo:" & vbCrLf & savePath, vbInformation, "RDI SIGO"
End Sub

' ---------------------------------------------------------------
'  Parsear linha CSV respeitando aspas
' ---------------------------------------------------------------
Function SplitCSVLine(linha As String, delim As String) As String()
    Dim cols    As New Collection
    Dim inQuote As Boolean
    Dim cell    As String
    Dim i       As Integer
    Dim ch      As String

    For i = 1 To Len(linha)
        ch = Mid(linha, i, 1)
        If ch = Chr(34) Then
            If inQuote And Mid(linha, i + 1, 1) = Chr(34) Then
                cell = cell & Chr(34): i = i + 1
            Else
                inQuote = Not inQuote
            End If
        ElseIf ch = delim And Not inQuote Then
            cols.Add cell: cell = ""
        Else
            cell = cell & ch
        End If
    Next i
    cols.Add cell

    Dim res() As String
    ReDim res(cols.Count - 1)
    For i = 1 To cols.Count
        res(i - 1) = cols(i)
    Next i
    SplitCSVLine = res
End Function

' ---------------------------------------------------------------
'  Adicionar bot?es na aba (execute uma vez ap?s importar)
' ---------------------------------------------------------------
Sub AdicionarBotoes()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(SHEET_DATA)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Sheets.Add( _
            After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        ws.Name = SHEET_DATA
        ws.Cells.Interior.Color = RGB(17, 24, 39)
    End If

    ' Remover bot?es antigos
    Dim shp As Shape
    For Each shp In ws.Shapes
        If shp.Type = msoFormControl Then shp.Delete
    Next shp

    ' Bot?o Abrir
    With ws.Buttons.Add(10, 8, 140, 24)
        .Caption  = "Abrir Arquivo RDI"
        .OnAction = "AbrirRDI"
        .Font.Size = 10: .Font.Bold = True
    End With

    ' Bot?o Salvar
    With ws.Buttons.Add(158, 8, 140, 24)
        .Caption  = "Salvar CSV"
        .OnAction = "SalvarCSV"
        .Font.Size = 10: .Font.Bold = True
    End With

    ws.Activate
    MsgBox "Bot?es adicionados! Agora clique em [Abrir Arquivo RDI].", _
           vbInformation, "RDI SIGO"
End Sub
