library(tidyverse)
library(httr)
library(jsonlite)

KEY <- "e69544ed-dadf-4260-9024-e83adfad1491"

# ── helpers ────────────────────────────────────────────────────────────────────

devig_market <- function(df, price_cols) {
  valid_cols <- df %>%
    select(any_of(price_cols)) %>%
    select(where(~!all(is.na(.)))) %>%
    names()
  
  df %>%
    pivot_longer(any_of(valid_cols), names_to = "col", values_to = "price") %>%
    mutate(
      implied = if_else(is.na(price), 0,
                        if_else(price > 0, 100 / (price + 100), abs(price) / (abs(price) + 100)))
    ) %>%
    group_by(fixture_id) %>%
    mutate(
      total   = sum(implied, na.rm = TRUE),
      p_novig = if_else(implied == 0, NA_real_, implied / total),
      price   = if_else(is.na(p_novig), NA_real_,
                        if_else(p_novig >= 0.5,
                                round(-100 * p_novig / (1 - p_novig), 0),
                                round((1 - p_novig) * 100 / p_novig, 0)))
    ) %>%
    ungroup() %>%
    select(-implied, -total, -p_novig) %>%
    pivot_wider(names_from = col, values_from = price)
}

devig_line <- function(op, up, to_dec) {
  p_o <- 1 / to_dec(op); p_u <- 1 / to_dec(up); tot <- p_o + p_u
  list(over = round(1 / (p_o / tot), 2), under = round(1 / (p_u / tot), 2))
}

to_dec <- function(ml) if_else(ml > 0, ml / 100 + 1, 1 - 100 / ml)

rename_odds <- function(df) {
  df %>%
    mutate(odds_name = case_when(
      odds_name == "r1"     ~ "1st_round_finish",
      odds_name == "r2"     ~ "2nd_round_finish",
      odds_name == "r3"     ~ "3rd_round_finish",
      odds_name == "r4"     ~ "4th_round_finish",
      odds_name == "r5"     ~ "5th_round_finish",
      odds_name == "ko"     ~ "knockouts",
      odds_name == "sub"    ~ "submissions",
      odds_name == "points" ~ "decision",
      odds_name == "ml"     ~ "moneyline",
      odds_name == "draw"   ~ "draw",
      TRUE ~ odds_name
    ))
}

# ── fixtures ───────────────────────────────────────────────────────────────────

#' @param fight_date character vector of dates e.g. c("2026-04-18", "2026-04-19")
get_fixtures <- function(fight_date) {
  txt <- VERB(
    "GET", "https://api.opticodds.com/api/v3/fixtures/active",
    query = list(sport = "MMA", league = "UFC"),
    add_headers(`X-Api-Key` = KEY),
    accept("application/json")
  ) %>%
    content("text", encoding = "UTF-8")
  
  txt %>%
    fromJSON(simplifyVector = FALSE) %>%
    .$data %>%
    map_df(function(x) {
      tibble(
        fixture_id = x$id,
        date       = x$start_date,
        home       = x$home_team_display,
        away       = x$away_team_display
      )
    }) %>%
    filter(as.Date(date) %in% as.Date(fight_date))
}

# ── per-fixture pull ───────────────────────────────────────────────────────────

#' @param fixture_id string
#' @param sportsbook string e.g. "fanduel", "betonline"
#' @param markets character vector — any of: "mov", "rounds", "fight_time"
#'   "fight_time" pulls both total_rounds and go_the_distance
pull_fight_odds <- function(fixture_id, sportsbook,
                            markets = c("mov", "rounds", "fight_time")) {
  url <- "https://api.opticodds.com/api/v3/fixtures/odds"
  
  safe_pull <- function(market) {
    response <- VERB("GET", url,
                     query = list(
                       sportsbook = sportsbook,
                       fixture_id = fixture_id,
                       market     = market,
                       sport      = "MMA"
                     ),
                     add_headers('X-Api-Key' = KEY),
                     content_type("application/octet-stream"),
                     accept("application/json")
    )
    
    parsed_raw <- content(response, "text", encoding = "UTF-8") %>%
      fromJSON(simplifyVector = FALSE)
    
    if (length(parsed_raw$data) == 0) {
      message("No data for fixture: ", fixture_id, " market: ", market)
      return(NULL)
    }
    
    parsed_raw$data[[1]]
  }
  
  # --- Moneyline always pulled ---
  p_ml <- safe_pull("moneyline")
  if (is.null(p_ml)) return(NULL)
  
  f1 <- p_ml$home_team_display
  f2 <- p_ml$away_team_display
  
  ml_tbl <- p_ml$odds %>%
    map_df(~tibble(market_id = .x$market_id, name = .x$name, price = as.numeric(.x$price))) %>%
    filter(market_id == "moneyline") %>%
    mutate(col = case_when(
      str_detect(name, fixed(f1)) ~ "f1_ml",
      str_detect(name, fixed(f2)) ~ "f2_ml",
      TRUE ~ NA_character_
    )) %>%
    filter(!is.na(col)) %>%
    select(col, price) %>%
    distinct() %>%
    pivot_wider(names_from = col, values_from = price, values_fn = first)
  
  ml_out <- tibble(fixture_id = p_ml$id, f1 = f1, f2 = f2, f1_ml = NA_real_, f2_ml = NA_real_)
  for (n in intersect(names(ml_tbl), names(ml_out))) ml_out[[n]] <- ml_tbl[[n]]
  
  ml_out <- ml_out %>%
    mutate(
      p1    = if_else(f1_ml > 0, 100/(f1_ml+100), -f1_ml/(-f1_ml+100)),
      p2    = if_else(f2_ml > 0, 100/(f2_ml+100), -f2_ml/(-f2_ml+100)),
      total = p1 + p2, p1_nv = p1/total, p2_nv = p2/total,
      f1_ml = if_else(p1_nv >= 0.5, round(-p1_nv/(1-p1_nv)*100,0), round((1-p1_nv)/p1_nv*100,0)),
      f2_ml = if_else(p2_nv >= 0.5, round(-p2_nv/(1-p2_nv)*100,0), round((1-p2_nv)/p2_nv*100,0))
    ) %>%
    select(fixture_id, f1, f2, f1_ml, f2_ml)
  
  fav <- if (ml_out$f1_ml <= ml_out$f2_ml) f1 else f2
  
  # --- Method of Victory ---
  finishes_long <- NULL
  mov_out <- NULL
  if ("mov" %in% markets) {
    p_mov <- safe_pull("method_of_victory")
    if (!is.null(p_mov)) {
      mov_tbl <- p_mov$odds %>%
        map_df(function(o) tibble(market_id = o$market_id, name = o$name, price = as.numeric(o$price))) %>%
        filter(market_id == "method_of_victory") %>%
        mutate(
          fighter = case_when(
            str_detect(name, fixed(paste0(f1, " - "))) ~ "f1",
            str_detect(name, fixed(paste0(f2, " - "))) ~ "f2",
            TRUE ~ NA_character_
          ),
          outcome = case_when(
            str_detect(str_to_lower(name), "ko/tko/dq") ~ "ko",
            str_detect(str_to_lower(name), "submission") ~ "sub",
            str_detect(str_to_lower(name), "decision")   ~ "points",
            TRUE ~ NA_character_
          ),
          col = paste0(fighter, "_", outcome)
        ) %>%
        filter(!is.na(fighter), !is.na(outcome)) %>%
        select(col, price) %>%
        distinct() %>%
        pivot_wider(names_from = col, values_from = price, values_fn = first)
      
      mov_out <- tibble(
        fixture_id = p_mov$id, f1 = f1, f2 = f2,
        f1_ko = NA_real_, f1_sub = NA_real_, f1_points = NA_real_,
        f2_ko = NA_real_, f2_sub = NA_real_, f2_points = NA_real_, draw = NA_real_
      )
      for (n in intersect(names(mov_tbl), names(mov_out))) mov_out[[n]] <- mov_tbl[[n]]
      mov_cols <- mov_out %>% select(where(is.numeric)) %>% names()
      mov_out  <- devig_market(mov_out, mov_cols)
      
      # --- Finishes (ko + sub combined probability per fighter) ---
      finishes_long <- mov_out %>%
        select(fixture_id, f1, f2, f1_ko, f1_sub, f2_ko, f2_sub) %>%
        pivot_longer(-c(fixture_id, f1, f2), names_to = "col", values_to = "american_odds") %>%
        filter(!is.na(american_odds)) %>%
        mutate(
          fighter = if_else(str_starts(col, "f1"), f1, f2),
          prob    = if_else(american_odds > 0, 100/(american_odds+100), abs(american_odds)/(abs(american_odds)+100))
        ) %>%
        group_by(fixture_id, fighter) %>%
        summarise(finish_prob = sum(prob, na.rm = TRUE), .groups = "drop") %>%
        mutate(
          odds_name          = "finishes",
          stat_value         = 0.5,
          over_decimal_odds  = round(1 / finish_prob, 2),
          under_decimal_odds = if_else(
            over_decimal_odds >= 1.25 & over_decimal_odds <= 5,
            round(1 / (1 - finish_prob), 2),
            NA_real_
          ),
          is_alt             = FALSE
        ) %>%
        select(fixture_id, fighter, odds_name, stat_value, over_decimal_odds, under_decimal_odds, is_alt)
    }
  }
  
  # --- Round Betting (always pulled to detect 5-round fights) ---
  p_round_check <- safe_pull("round_betting")
  is_five_round <- if (!is.null(p_round_check)) {
    names_vec <- p_round_check$odds %>% map_chr(~.x$name)
    any(str_detect(str_to_lower(names_vec), "4th round|5th round"))
  } else FALSE
  
  round_out <- NULL
  if ("rounds" %in% markets) {
    p_round <- p_round_check
    if (!is.null(p_round)) {
      round_df <- p_round$odds %>%
        map_df(function(o) tibble(market_id = o$market_id, name = o$name, price = as.numeric(o$price))) %>%
        filter(market_id == "round_betting")
      
      round_tbl <- round_df %>%
        mutate(
          fighter = case_when(
            str_detect(name, fixed(f1)) ~ "f1",
            str_detect(name, fixed(f2)) ~ "f2",
            TRUE ~ NA_character_
          ),
          outcome = case_when(
            str_detect(str_to_lower(name), "1st round") ~ "r1",
            str_detect(str_to_lower(name), "2nd round") ~ "r2",
            str_detect(str_to_lower(name), "3rd round") ~ "r3",
            str_detect(str_to_lower(name), "4th round") ~ "r4",
            str_detect(str_to_lower(name), "5th round") ~ "r5",
            str_detect(str_to_lower(name), "decision")  ~ "dec",
            TRUE ~ NA_character_
          ),
          col = paste0(fighter, "_", outcome)
        ) %>%
        filter(!is.na(col)) %>%
        select(col, price) %>%
        distinct() %>%
        pivot_wider(names_from = col, values_from = price, values_fn = first)
      
      draw_price <- round_df %>%
        filter(str_to_lower(name) == "draw") %>%
        pull(price) %>%
        first()
      
      round_out <- tibble(
        fixture_id = p_round$id, f1 = f1, f2 = f2,
        f1_r1 = NA_real_, f1_r2 = NA_real_, f1_r3 = NA_real_,
        f1_r4 = NA_real_, f1_r5 = NA_real_, f1_dec = NA_real_,
        f2_r1 = NA_real_, f2_r2 = NA_real_, f2_r3 = NA_real_,
        f2_r4 = NA_real_, f2_r5 = NA_real_, f2_dec = NA_real_,
        draw  = if_else(!is.na(draw_price), draw_price, NA_real_)
      )
      for (n in intersect(names(round_tbl), names(round_out))) round_out[[n]] <- round_tbl[[n]]
      
      is_five_round_rounds <- !all(is.na(c(round_out$f1_r4, round_out$f1_r5, round_out$f2_r4, round_out$f2_r5)))
      
      round_cols <- if (is_five_round_rounds) {
        c("f1_r1","f1_r2","f1_r3","f1_r4","f1_r5","f1_dec","f2_r1","f2_r2","f2_r3","f2_r4","f2_r5","f2_dec","draw")
      } else {
        c("f1_r1","f1_r2","f1_r3","f1_dec","f2_r1","f2_r2","f2_r3","f2_dec","draw")
      }
      
      round_out <- devig_market(round_out, round_cols) %>%
        select(-any_of(c("f1_dec","f2_dec","draw")))
    }
  }
  
  # --- Fight Time (total_rounds + go_the_distance) ---
  rounds_long  <- NULL
  has_short_12 <- FALSE
  
  if ("fight_time" %in% markets) {
    p_rounds <- safe_pull("total_rounds")
    if (!is.null(p_rounds)) {
      rounds_df <- p_rounds$odds %>%
        map_df(function(o) tibble(
          market_id      = o$market_id,
          selection_line = o$selection_line,
          points         = as.numeric(o$points),
          price          = as.numeric(o$price)
        )) %>%
        filter(market_id == "total_rounds") %>%
        arrange(points) %>%
        group_by(points) %>%
        filter(n() == 2) %>%
        summarise(
          over_price  = price[selection_line == "over"],
          under_price = price[selection_line == "under"],
          .groups = "drop"
        ) %>%
        rowwise() %>%
        mutate(
          dv         = list(devig_line(over_price, under_price, to_dec)),
          over_dec   = dv$over,
          under_dec  = dv$under,
          stat_value = case_when(
            points == 0.5 ~ 2.5,
            points == 1.5 ~ 7.5,
            points == 2.5 ~ 12.5,
            points == 3.5 ~ 17.5,
            points == 4.5 ~ 22.5,
            TRUE          ~ NA_real_
          )
        ) %>%
        ungroup() %>%
        filter(!is.na(stat_value)) %>%
        select(stat_value, over_dec, under_dec)
      
      has_short_12 <- any(rounds_df$stat_value == 12.5 & rounds_df$over_dec <= 1.5)
      rounds_df    <- rounds_df %>% filter(!(stat_value == 12.5 & over_dec <= 1.5))
      
      main_line <- rounds_df %>%
        mutate(dist = abs(over_dec - 2)) %>%
        slice_min(dist, n = 1) %>%
        pull(stat_value)
      
      rounds_long <- rounds_df %>%
        mutate(
          fixture_id         = p_rounds$id,
          fighter            = fav,
          odds_name          = "fight_time",
          over_decimal_odds  = over_dec,
          under_decimal_odds = under_dec,
          is_alt             = stat_value != main_line
        ) %>%
        select(fixture_id, fighter, odds_name, stat_value, over_decimal_odds, under_decimal_odds, is_alt)
    }
    
    p_gtd <- safe_pull("go_the_distance")
    if (!is.null(p_gtd)) {
      gtd_df <- p_gtd$odds %>%
        map_df(function(o) tibble(
          market_id      = o$market_id,
          selection_line = o$selection_line %||% NA_character_,
          name           = o$name,
          price          = as.numeric(o$price)
        )) %>%
        filter(market_id == "go_the_distance")
      
      if (all(is.na(gtd_df$selection_line))) {
        gtd_df <- gtd_df %>%
          mutate(selection_line = case_when(
            str_detect(str_to_lower(name), "yes|over|goes the distance") ~ "over",
            str_detect(str_to_lower(name), "no|under|does not go")       ~ "under",
            TRUE ~ NA_character_
          ))
      }
      
      over_price  <- gtd_df %>% filter(selection_line == "over")  %>% pull(price) %>% first()
      under_price <- gtd_df %>% filter(selection_line == "under") %>% pull(price) %>% first()
      
      if (!is.na(over_price) && !is.na(under_price)) {
        dv       <- devig_line(over_price, under_price, to_dec)
        gtd_stat <- if (is_five_round) 24.99 else 14.99
        
        gtd_row <- tibble(
          fixture_id         = p_gtd$id,
          fighter            = fav,
          odds_name          = "fight_time",
          stat_value         = gtd_stat,
          over_decimal_odds  = dv$over,
          under_decimal_odds = dv$under,
          is_alt             = !has_short_12
        )
        rounds_long <- bind_rows(rounds_long, gtd_row)
      }
    }
  }
  
  # --- Build odds_long ---
  sources <- list(ml_out %>% select(fixture_id, f1, f2, f1_ml, f2_ml))
  
  if (!is.null(round_out)) {
    sources <- c(sources, list(round_out %>% select(fixture_id, f1, f2, any_of(c(
      "f1_r1","f1_r2","f1_r3","f1_r4","f1_r5",
      "f2_r1","f2_r2","f2_r3","f2_r4","f2_r5"
    )))))
  }
  
  if (!is.null(mov_out)) {
    sources <- c(sources, list(mov_out %>% select(
      fixture_id, f1, f2, any_of(c("f1_ko","f1_sub","f1_points","f2_ko","f2_sub","f2_points","draw"))
    )))
  }
  
  odds_long <- bind_rows(sources) %>%
    pivot_longer(cols = -c(fixture_id, f1, f2), names_to = "odds_name", values_to = "value") %>%
    mutate(
      fighter   = if_else(str_starts(odds_name, "f1"), f1,
                          if_else(str_starts(odds_name, "f2"), f2, "draw")),
      odds_name = gsub("^f[12]_", "", odds_name)
    ) %>%
    filter(!is.na(value)) %>%
    mutate(
      prob               = if_else(value > 0, 100/(value+100), abs(value)/(abs(value)+100)),
      stat_value         = 0.5,
      over_decimal_odds  = round(1 / prob, 2),
      under_decimal_odds = if_else(
        over_decimal_odds >= 1.25 & over_decimal_odds <= 5,
        round(1 / (1 - prob), 2),
        NA_real_
      ),
      is_alt             = FALSE
    ) %>%
    select(fixture_id, fighter, odds_name, stat_value, over_decimal_odds, under_decimal_odds, is_alt)
  
  bind_rows(odds_long, rounds_long, finishes_long)
}

# ── main entry point ───────────────────────────────────────────────────────────

#' @param fight_date character vector e.g. c("2026-04-18", "2026-04-19")
#' @param sportsbook string e.g. "fanduel", "betonline"
#' @param markets character vector — any of: "mov", "rounds", "fight_time"
get_all_odds <- function(fight_date, sportsbook, markets = c("mov", "rounds", "fight_time")) {
  fixtures <- get_fixtures(fight_date)
  
  if (nrow(fixtures) == 0) {
    message("No fixtures found for: ", paste(fight_date, collapse = ", "))
    return(tibble())
  }
  
  fixtures %>%
    pull(fixture_id) %>%
    map(~{
      tryCatch(
        pull_fight_odds(.x, sportsbook, markets),
        error = function(e) {
          message("Skipping fixture ", .x, " — ", e$message)
          NULL
        }
      )
    }) %>%
    compact() %>%
    bind_rows() %>%
    rename_odds() %>%
    mutate(is_alt = ifelse(is_alt, TRUE, FALSE)) %>%
    filter(!odds_name %in% c("moneyline", "decision"))
}